import colors from "colors";
import inquirer from "inquirer";
import { IFs, memfs } from "memfs";
import { getNewProjectTemplateList } from "../../requests/getTemplateList.js";
import { regions } from "../../utils/configs.js";
import { Template } from "../../requests/models.js";
import git from "isomorphic-git";
import http from "isomorphic-git/http/node/index.js";
import { parse, stringify } from "yaml";
import path from "path";
import { YamlProjectConfiguration } from "../../models/yamlProjectConfiguration.js";
import { CloudProviderIdentifier } from "../../models/cloudProviderIdentifier.js";
import nativeFs from "fs";
import { setLinkPathForProject } from "../../utils/linkDatabase.js";
import log from "loglevel";
import { platform } from "os";

interface ProjectInfo {
    projectName: string;
    projectRegion: string;
}

export async function createNewProject() {
    const { projectName }: { projectName: string } = await inquirer.prompt([
        {
            type: "input",
            name: "projectName",
            message: colors.magenta("Please enter a project name:"),
            default: "genezio-project",
            validate: (input: string) => {
                const regex = /^[a-zA-Z][-a-zA-Z0-9]*$/;
                if (!regex.test(input)) {
                    return colors.red(
                        "The project name must match start with a letter and contain only letters, numbers and dashes",
                    );
                }
                return true;
            },
        },
    ]);

    const projectPath = path.join(process.cwd(), projectName);
    let overwriteDecision: "deleteThenWrite" | "cancel" | "overwrite" | undefined = undefined;

    if (nativeFs.existsSync(projectPath)) {
        ({ overwriteDecision } = await inquirer.prompt([
            {
                type: "list",
                name: "overwriteDecision",
                message: colors.red("The project folder already exists. What do you want to do?"),
                choices: [
                    {
                        name: "Remove existing files and create a new project",
                        value: "deleteThenWrite",
                    },
                    {
                        name: "Cancel operation",
                        value: "cancel",
                    },
                    {
                        name: "Overwrite the existing files (.git and README.md will be kept)",
                        value: "overwrite",
                    },
                ],
            },
        ]));
    }

    if (overwriteDecision === "cancel") {
        return;
    }

    const {
        projectRegion,
        projectType,
    }: {
        projectRegion: string;
        projectType: "backend" | "fullstack" | "frontend";
    } = await inquirer.prompt([
        {
            type: "list",
            name: "projectRegion",
            message: colors.magenta("Choose a region for your project"),
            choices: regions,
            pageSize: regions.length,
        },
        {
            type: "list",
            name: "projectType",
            message: colors.magenta("What type of project would you like to create?"),
            choices: [
                {
                    name: "Backend + Frontend (Fullstack)",
                    value: "fullstack",
                },
                {
                    name: "Backend",
                    value: "backend",
                },
                // TODO: Enable after adding a static frontend template
                // {
                //     name: "Frontend",
                //     value: "frontend",
                // },
            ],
        },
    ]);

    const { fs } = memfs();
    const templateList = await getNewProjectTemplateList();
    const projectInfo: ProjectInfo = {
        projectName,
        projectRegion,
    };

    let projectStructure: "monorepo" | "multirepo" | undefined = undefined;
    // Create the new project in a virtual filesystem (memfs)
    switch (projectType) {
        case "fullstack":
            projectStructure = await createFullstackProject(fs, templateList, projectInfo);
            break;
        case "backend":
            await createProject(fs, templateList, "Backend", projectInfo);
            break;
        case "frontend":
            await createProject(
                fs,
                // Filter out templates that that need a compatible backend
                templateList.filter((template) => template.compatibilityMapping === null),
                "Frontend",
                projectInfo,
            );
            break;
    }

    // Delete existing files, if user chose to
    if (overwriteDecision === "deleteThenWrite") {
        nativeFs.rmSync(projectPath, { recursive: true });
    }

    // Copy from memfs to local filesystem
    copyRecursiveToNativeFs(fs, "/", projectPath, { keepDotGit: true, renameReadme: true });

    // Genezio link inside the client project
    switch (projectType) {
        case "frontend":
            await setLinkPathForProject(
                projectInfo.projectName,
                projectInfo.projectRegion,
                projectPath,
            );

            log.info(SUCCESSFULL_CREATE_FRONTEND(projectPath, projectName));
            break;
        case "fullstack":
            switch (projectStructure) {
                case "monorepo":
                    log.info(SUCCESSFULL_CREATE_MONOREPO(projectPath, projectName));
                    break;
                case "multirepo":
                    await setLinkPathForProject(
                        projectInfo.projectName,
                        projectInfo.projectRegion,
                        path.join(projectPath, "client"),
                    );
                    log.info(SUCCESSFULL_CREATE_MULTIREPO(projectPath, projectName));
                    break;
            }
            break;
        case "backend":
            log.info(SUCCESSFULL_CREATE_BACKEND(projectPath, projectName));
    }
}

async function createFullstackProject(fs: IFs, templateList: Template[], projectInfo: ProjectInfo) {
    const { projectStructure }: { projectStructure: "monorepo" | "multirepo" } =
        await inquirer.prompt([
            {
                type: "list",
                name: "projectStructure",
                message: colors.magenta("What project structure would you like to use?"),
                choices: [
                    {
                        name: "Monorepo (Both projects in the same git repository)",
                        value: "monorepo",
                    },
                    {
                        name: "Multirepo (Each project in its own git repository)",
                        value: "multirepo",
                    },
                ],
            },
        ]);

    switch (projectStructure) {
        case "monorepo": {
            const { compatibilityMapping } = await createProject(
                fs,
                templateList,
                "Backend",
                projectInfo,
                "/server",
            );
            fs.rmdirSync("/server/.git", { recursive: true });

            // Create frontend, but provide only backend-compatible templates
            await createProject(
                fs,
                templateList.filter(
                    (template) => template.compatibilityMapping === compatibilityMapping,
                ),
                "Frontend",
                projectInfo,
                "/client",
            );
            fs.rmdirSync("/client/.git", { recursive: true });

            // Create workspace genezio.yaml
            await createWorkspaceYaml(fs, projectInfo, "/server", "/client");
            // Replace placeholders in genezio.yaml
            await replacePlaceholders(fs, "/genezio.yaml", {
                "(•◡•)project-name(•◡•)": projectInfo.projectName,
                "(•◡•)region(•◡•)": projectInfo.projectRegion,
            });

            // Create .genezioignore file that ignores the client folder
            fs.writeFileSync("/.genezioignore", "client\n");

            // Create git repository
            await git.init({ fs, dir: "/", defaultBranch: "main" });
            // Add all files
            await git.add({ fs, dir: "/", filepath: "." });
            // Commit
            await git.commit({
                fs,
                dir: "/",
                author: { name: "Genezio", email: "contact@genez.io" },
                message: "Initial commit",
            });
            break;
        }
        case "multirepo": {
            const { compatibilityMapping } = await createProject(
                fs,
                templateList,
                "Backend",
                projectInfo,
                "/server",
            );

            // Create frontend project, but provide only backend-compatible templates
            await createProject(
                fs,
                templateList.filter(
                    (template) => template.compatibilityMapping === compatibilityMapping,
                ),
                "Frontend",
                projectInfo,
                "/client",
            );
            break;
        }
    }

    return projectStructure;
}

async function createProject(
    fs: IFs,
    templateList: Template[],
    category: "Backend" | "Frontend",
    projectInfo: ProjectInfo,
    projectPath = "/",
): Promise<Template> {
    const supportedLanguages = [
        // Keep only distinct languages
        ...new Set(
            templateList
                .filter((template) => template.category === category)
                .map((template) => template.language),
        ),
    ];

    if (supportedLanguages.length === 0) {
        throw new Error(
            `Unfortunately, no ${category} templates could be found for this project type :(. We are working on adding more templates!`,
        );
    }

    let selectedLanguage: string;
    // If there is only one language option, don't ask the user to select one
    if (supportedLanguages.length === 1) {
        selectedLanguage = supportedLanguages[0];
    } else {
        ({ selectedLanguage } = await inquirer.prompt([
            {
                type: "list",
                name: "selectedLanguage",
                message:
                    colors.magenta("Select your desired ") +
                    colors.green(category) +
                    colors.magenta(" language:"),
                choices: supportedLanguages.map((language) => ({
                    name: colorLanguage(language),
                    value: language,
                })),
            },
        ]));
    }

    const templatesForLanguage = templateList.filter(
        (template) => template.category === category && template.language === selectedLanguage,
    );

    let selectedTemplate: Template;
    // If there is only one template option, don't ask the user to select one
    if (templatesForLanguage.length === 1) {
        selectedTemplate = templatesForLanguage[0];
    } else {
        ({ selectedTemplate } = await inquirer.prompt([
            {
                type: "list",
                name: "selectedTemplate",
                message:
                    colors.magenta("Select your desired ") +
                    colorLanguage(selectedLanguage) +
                    colors.magenta(" template:"),
                choices: templatesForLanguage.map((template) => ({
                    name: template.name,
                    value: template,
                })),
            },
        ]));
    }

    const { repository: templateRepository } = selectedTemplate;

    // Clone template repository
    await git.clone({ fs, http, dir: projectPath, url: templateRepository });

    // Remove .git folder
    fs.rmdirSync(path.join(projectPath, ".git"), { recursive: true });

    // Replace placeholders
    await replacePlaceholders(fs, projectPath, {
        "(•◡•)project-name(•◡•)": projectInfo.projectName,
        "(•◡•)region(•◡•)": projectInfo.projectRegion,
    });

    // Create git repository
    await git.init({ fs, dir: projectPath, defaultBranch: "main" });
    // Add all files
    await git.add({ fs, dir: projectPath, filepath: "." });
    // Commit
    await git.commit({
        fs,
        dir: projectPath,
        author: { name: "Genezio", email: "contact@genez.io" },
        message: "Initial commit",
    });

    return selectedTemplate;
}

async function createWorkspaceYaml(
    fs: IFs,
    projectInfo: ProjectInfo,
    backendPath: string,
    frontendPath: string,
) {
    const backendConfiguration = await readConfiguration(
        fs,
        path.join(backendPath, "genezio.yaml"),
    );
    fs.rmSync(path.join(backendPath, "genezio.yaml"));
    const frontendConfiguration = await readConfiguration(
        fs,
        path.join(frontendPath, "genezio.yaml"),
    );
    fs.rmSync(path.join(frontendPath, "genezio.yaml"));

    const workspaceBackendPath = backendPath.startsWith(path.parse(backendPath).root)
        ? backendPath.slice(path.parse(backendPath).root.length)
        : backendPath;
    const workspaceFrontendPath = frontendPath.startsWith(path.parse(frontendPath).root)
        ? frontendPath.slice(path.parse(frontendPath).root.length)
        : frontendPath;

    const workspaceConfiguration = new YamlProjectConfiguration(
        /* name: */ projectInfo.projectName,
        /* region: */ projectInfo.projectRegion,
        /* language: */ backendConfiguration.language,
        /* sdk: */ undefined,
        /* cloudProvider: */ CloudProviderIdentifier.GENEZIO,
        /* classes: */ [],
        /* frontend: */ frontendConfiguration.frontend?.path
            ? { path: path.join(workspaceFrontendPath, frontendConfiguration.frontend?.path) }
            : undefined,
        /* scripts: */ {
            preFrontendDeploy: frontendConfiguration.scripts?.preFrontendDeploy,
            postFrontendDeploy: frontendConfiguration.scripts?.postFrontendDeploy,
            preBackendDeploy: backendConfiguration.scripts?.preBackendDeploy,
            postBackendDeploy: backendConfiguration.scripts?.postBackendDeploy,
            preStartLocal: backendConfiguration.scripts?.preStartLocal,
            postStartLocal: backendConfiguration.scripts?.postStartLocal,
            preReloadLocal: backendConfiguration.scripts?.preReloadLocal,
        },
        /* plugins: */ undefined,
        /* options: */ undefined,
        /* workspace: */ { backend: workspaceBackendPath, frontend: workspaceFrontendPath },
        /* packageManager: */ backendConfiguration.packageManager,
    );

    fs.writeFileSync("/genezio.yaml", stringify(workspaceConfiguration));
}

async function readConfiguration(fs: IFs, path: string) {
    const configurationFileContentUTF8 = fs.readFileSync(path, "utf8") as string;

    let configurationFileContent;
    try {
        configurationFileContent = parse(configurationFileContentUTF8);
    } catch (error: unknown) {
        throw new Error(`The backend configuration yaml file is not valid.\n${error}`);
    }

    return await YamlProjectConfiguration.create(configurationFileContent);
}

async function replacePlaceholders(
    fs: IFs,
    replacePath: string,
    placeholders: Record<string, string>,
) {
    const fromStats = fs.statSync(replacePath);
    if (fromStats.isDirectory()) {
        const files = fs.readdirSync(replacePath) as string[];
        for (const file of files) {
            replacePlaceholders(fs, path.join(replacePath, file), placeholders);
        }
    } else {
        const fileContent = fs.readFileSync(replacePath, "utf8") as string;
        if (!fileContent.includes("(•◡•)")) {
            return;
        }

        const newFileContent = Object.entries(placeholders).reduce(
            (acc, [placeholder, value]) => acc.replaceAll(placeholder, value),
            fileContent,
        );
        fs.writeFileSync(replacePath, newFileContent);
    }
}

interface CopyOptions {
    keepDotGit?: boolean;
    renameReadme?: boolean;
}

function copyRecursiveToNativeFs(fromFs: IFs, from: string, to: string, options?: CopyOptions) {
    const fromStats = fromFs.statSync(from);
    if (fromStats.isDirectory()) {
        nativeFs.mkdirSync(to, { recursive: true });
        const files = fromFs.readdirSync(from) as string[];
        for (const file of files) {
            if (
                options?.keepDotGit &&
                file === ".git" &&
                nativeFs.existsSync(path.join(to, file))
            ) {
                continue;
            }
            copyRecursiveToNativeFs(fromFs, path.join(from, file), path.join(to, file), options);
        }
    } else {
        if (
            options?.renameReadme &&
            (path.basename(from) === "README.md" || path.basename(from) === "README") &&
            nativeFs.existsSync(to)
        ) {
            const oldReadmePath = path.join(path.dirname(to), `${path.basename(from)}.old`);
            nativeFs.copyFileSync(to, oldReadmePath);
        }
        const fileContent = fromFs.readFileSync(from);
        nativeFs.writeFileSync(to, fileContent);
    }
}

function colorLanguage(languageName: string): string {
    switch (languageName) {
        case "TypeScript":
            return colors.blue(languageName);
        case "JavaScript":
            return colors.yellow(languageName);
        case "Python":
            return colors.green(languageName);
        case "Go":
            return colors.cyan(languageName);
        case "Dart":
            return colors.cyan(languageName);
        case "Kotlin":
            return colors.magenta(languageName);
        default:
            return languageName;
    }
}

const SUCCESSFULL_CREATE_MONOREPO = (
    projectPath: string,
    projectName: string,
) => `Project initialized in ${projectPath}.

    For ${colors.yellow("deployment")}, run:
        cd ${projectName}
        genezio deploy


    For ${colors.green("testing")}, run:
      Terminal 1: 
        cd ${projectName}
        genezio local

      Terminal 2: 
        cd ${projectName}/client
        npm install
        npm run dev
`;

const SUCCESSFULL_CREATE_MULTIREPO = (
    projectPath: string,
    projectName: string,
) => `Project initialized in ${projectPath}. Now run:

    For ${colors.yellow("deployment")}, run:
        cd ${projectName}
        ${
            platform() !== "win32"
                ? "(cd server && genezio deploy)"
                : "pushd server; genezio deploy; popd"
        }
        ${
            platform() !== "win32"
                ? "(cd client && genezio deploy)"
                : "pushd client; genezio deploy; popd"
        }


    For ${colors.green("testing")}, run:
      Terminal 1: 
        cd ${projectName}/server
        genezio local

      Terminal 2: 
        cd ${projectName}/client
        npm install
        npm run dev
`;

const SUCCESSFULL_CREATE_BACKEND = (
    projectPath: string,
    projectName: string,
) => `Project initialized in ${projectPath}. Now run:

    For ${colors.yellow("deployment")}, run:
        cd ${projectName}
        genezio deploy


    For ${colors.green("testing")}, run:
        cd ${projectName}
        genezio local
`;

const SUCCESSFULL_CREATE_FRONTEND = (
    projectPath: string,
    projectName: string,
) => `Project initialized in ${projectPath}. Now run:

    For ${colors.yellow("deployment")}, run:
        cd ${projectName}
        genezio deploy


    For ${colors.green("testing")}, run:
        cd ${projectName}
        npm install
        npm run dev
`;
