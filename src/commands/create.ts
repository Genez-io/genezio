import colors from "colors";
import { IFs, memfs } from "memfs";
import { getNewProjectTemplateList } from "../requests/getTemplateList.js";
import { Template } from "../requests/models.js";
import git from "isomorphic-git";
import http from "isomorphic-git/http/node/index.js";
import { parse, stringify } from "yaml";
import path from "path";
import { YamlProjectConfiguration } from "../models/yamlProjectConfiguration.js";
import { CloudProviderIdentifier } from "../models/cloudProviderIdentifier.js";
import nativeFs from "fs";
import { setLinkPathForProject } from "../utils/linkDatabase.js";
import log from "loglevel";
import { platform } from "os";
import { GenezioCreateOptions } from "../models/commandOptions.js";
import { debugLogger } from "../utils/logging.js";

type ProjectInfo = {
    name: string;
    region: string;
    type: "backend" | "frontend";
    template: Template;
};

type FullstackProjectInfo = {
    name: string;
    region: string;
    structure: "monorepo" | "multirepo";
    backendTemplate: Template;
    frontendTemplate: Template;
};

export async function createCommand(options: GenezioCreateOptions) {
    const { fs } = memfs();
    const templateList = await getNewProjectTemplateList();

    const projectNameRegex = /^[a-zA-z][a-zA-Z0-9-]+$/;
    if (!projectNameRegex.test(options.name)) {
        throw new Error(
            "Project name must start with a letter and contain only letters, numbers and dashes",
        );
    }

    const projectPath = path.join(process.cwd(), options.name);
    if (nativeFs.existsSync(projectPath)) {
        // If the project contains only a README.md/README or a .git folder, it's safe to continue
        const files = nativeFs.readdirSync(projectPath);
        for (const file of files) {
            const allowedFiles = ["README.md", "README", ".git", ".gitignore", "LICENSE"];
            if (!allowedFiles.includes(file)) {
                throw new Error(
                    `A folder named '${options.name}' already exists. Please choose another project name`,
                );
            }
        }
    }

    // Create the new project in a virtual filesystem (memfs)
    switch (true) {
        case "fullstack" in options: {
            const [backendTemplate, frontendTemplate] = await findFullstackTemplates(
                options.fullstack,
            );

            const projectInfo: FullstackProjectInfo = {
                name: options.name,
                region: options.region,
                structure: options.structure,
                backendTemplate,
                frontendTemplate,
            };

            debugLogger.debug(
                "Creating fullstack project\n",
                projectInfo.backendTemplate.repository + "\n",
                projectInfo.frontendTemplate.repository,
            );
            await createFullstackProject(fs, projectInfo);
            break;
        }
        case "backend" in options: {
            const template = templateList.find(
                (template) => template.id === options.backend && template.category === "Backend",
            );

            if (!template) {
                // TOOD: Add a way to list available templates and tell the user about this command
                throw new Error("Could not find backend template");
            }

            const projectInfo: ProjectInfo = {
                name: options.name,
                region: options.region,
                type: "backend",
                template,
            };

            debugLogger.debug("Creating backend project", projectInfo.template.repository);
            await createProject(fs, projectInfo);
            break;
        }
        case "frontend" in options: {
            const template = templateList.find(
                (template) => template.id === options.frontend && template.category === "Frontend",
            );

            if (!template) {
                // TOOD: Add a way to list available templates and tell the user about this command
                throw new Error("Could not find frontend template");
            }

            if (template.compatibilityMapping) {
                throw new Error(
                    "The selected frontend template requires a compatible backend. Try creating a fullstack project instead",
                );
            }

            const projectInfo: ProjectInfo = {
                name: options.name,
                region: options.region,
                type: "frontend",
                template,
            };

            debugLogger.debug("Creating frontend project", projectInfo.template.repository);
            await createProject(fs, projectInfo);
            break;
        }
    }

    // Copy from memfs to local filesystem
    copyRecursiveToNativeFs(fs, "/", projectPath, { keepDotGit: true, renameReadme: true });

    // Genezio link inside the client project
    switch (true) {
        case "frontend" in options:
            await setLinkPathForProject(options.name, options.region, projectPath);

            log.info(SUCCESSFULL_CREATE_FRONTEND(projectPath, options.name));
            break;
        case "fullstack" in options:
            switch (options.structure) {
                case "monorepo":
                    log.info(SUCCESSFULL_CREATE_MONOREPO(projectPath, options.name));
                    break;
                case "multirepo":
                    await setLinkPathForProject(
                        options.name,
                        options.region,
                        path.join(projectPath, "client"),
                    );
                    log.info(SUCCESSFULL_CREATE_MULTIREPO(projectPath, options.name));
                    break;
            }
            break;
        case "backend" in options:
            log.info(SUCCESSFULL_CREATE_BACKEND(projectPath, options.name));
    }
}

async function createFullstackProject(fs: IFs, projectInfo: FullstackProjectInfo) {
    const backendProjectInfo: ProjectInfo = {
        name: projectInfo.name,
        region: projectInfo.region,
        type: "backend",
        template: projectInfo.backendTemplate,
    };
    const frontendProjectInfo: ProjectInfo = {
        name: projectInfo.name,
        region: projectInfo.region,
        type: "frontend",
        template: projectInfo.frontendTemplate,
    };

    switch (projectInfo.structure) {
        case "monorepo": {
            debugLogger.debug("Creating monorepo project");

            await createProject(fs, backendProjectInfo, "/server");
            fs.rmdirSync("/server/.git", { recursive: true });

            // Create frontend, but provide only backend-compatible templates
            await createProject(fs, frontendProjectInfo, "/client");
            fs.rmdirSync("/client/.git", { recursive: true });

            // Create workspace genezio.yaml
            await createWorkspaceYaml(fs, projectInfo, "/server", "/client");
            // Replace placeholders in genezio.yaml
            await replacePlaceholders(fs, "/genezio.yaml", {
                "(•◡•)project-name(•◡•)": projectInfo.name,
                "(•◡•)region(•◡•)": projectInfo.region,
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
            debugLogger.debug("Creating multirepo project");

            await createProject(fs, backendProjectInfo, "/server");
            await createProject(fs, frontendProjectInfo, "/client");
            break;
        }
    }
}

async function createProject(fs: IFs, projectInfo: ProjectInfo, projectPath = "/") {
    const { repository: templateRepository } = projectInfo.template;

    // Clone template repository
    await git.clone({ fs, http, dir: projectPath, url: templateRepository });

    // Remove .git folder
    fs.rmdirSync(path.join(projectPath, ".git"), { recursive: true });

    // Replace placeholders
    await replacePlaceholders(fs, projectPath, {
        "(•◡•)project-name(•◡•)": projectInfo.name,
        "(•◡•)region(•◡•)": projectInfo.region,
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
}

async function createWorkspaceYaml(
    fs: IFs,
    projectInfo: FullstackProjectInfo,
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

    const backendScripts = backendConfiguration.scripts;

    const workspaceConfiguration = new YamlProjectConfiguration(
        /* name: */ projectInfo.name,
        /* region: */ projectInfo.region,
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
            preBackendDeploy: backendScripts?.preBackendDeploy,
            postBackendDeploy: backendScripts?.postBackendDeploy,
            preStartLocal: backendScripts?.preStartLocal
                ? `cd ${workspaceBackendPath} && ${backendScripts?.preStartLocal}`
                : undefined,
            postStartLocal: backendScripts?.postStartLocal
                ? `cd ${workspaceBackendPath} && ${backendScripts?.postStartLocal}`
                : undefined,
            preReloadLocal: backendScripts?.preReloadLocal
                ? `cd ${workspaceBackendPath} && ${backendScripts?.preReloadLocal}`
                : undefined,
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
        throw new Error(`The ${path} configuration yaml file is not valid.\n${error}`);
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

async function findFullstackTemplates(templates: [string, string]): Promise<[Template, Template]> {
    if (templates.length !== 2) {
        throw new Error("Fullstack project requires two templates");
    }

    let [backendTemplateId, frontendTemplateId] = templates;
    const templateList = await getNewProjectTemplateList();

    let backendTemplate = templateList.find(
        (template) => template.id === backendTemplateId && template.category === "Backend",
    );
    let frontendTemplate = templateList.find(
        (template) => template.id === frontendTemplateId && template.category === "Frontend",
    );

    if (backendTemplate && frontendTemplate) {
        if (backendTemplate.compatibilityMapping !== frontendTemplate.compatibilityMapping) {
            // TOOD: Add a way to list available templates and tell the user about this command
            throw new Error(
                "The provided templates are not compatible. Please provide two compatible templates",
            );
        }

        return [backendTemplate, frontendTemplate];
    }

    [frontendTemplateId, backendTemplateId] = templates;
    backendTemplate = templateList.find(
        (template) => template.id === backendTemplateId && template.category === "Backend",
    );
    frontendTemplate = templateList.find(
        (template) => template.id === frontendTemplateId && template.category === "Frontend",
    );

    if (!backendTemplate || !frontendTemplate) {
        // TOOD: Add a way to list available templates and tell the user about this command
        throw new Error(
            "Could not find templates. Provide two templates, one for the frontend and one for the backend",
        );
    }
    if (backendTemplate.compatibilityMapping !== frontendTemplate.compatibilityMapping) {
        throw new Error(
            "The provided templates are not compatible. Please provide two compatible templates",
        );
    }

    return [backendTemplate, frontendTemplate];
}

const SUCCESSFULL_CREATE_MONOREPO = (
    projectPath: string,
    projectName: string,
) => `Project initialized in ${projectPath}.

    For ${colors.yellow("deployment")} of both frontend and backend, run:
        cd ${projectName}
        genezio deploy


    For ${colors.green("testing")} locally, run:
      Terminal 1 (start the backend): 
        cd ${projectName}
        genezio local

      Terminal 2 (start the frontend): 
        cd ${projectName}/client
        npm install
        npm run dev
`;

const SUCCESSFULL_CREATE_MULTIREPO = (
    projectPath: string,
    projectName: string,
) => `Project initialized in ${projectPath}. Now run:

    For ${colors.yellow("deployment")} of both frontend and backend, run:
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


    For ${colors.green("testing")} locally, run:
      Terminal 1 (start the backend): 
        cd ${projectName}/server
        genezio local

      Terminal 2 (start the frontend): 
        cd ${projectName}/client
        npm install
        npm run dev
`;

const SUCCESSFULL_CREATE_BACKEND = (
    projectPath: string,
    projectName: string,
) => `Project initialized in ${projectPath}. Now run:

    For ${colors.yellow("deployment")} of the backend, run:
        cd ${projectName}
        genezio deploy


    For ${colors.green("testing")} locally, run:
        cd ${projectName}
        genezio local
`;

const SUCCESSFULL_CREATE_FRONTEND = (
    projectPath: string,
    projectName: string,
) => `Project initialized in ${projectPath}. Now run:

    For ${colors.yellow("deployment")} of the frontend, run:
        cd ${projectName}
        genezio deploy


    For ${colors.green("testing")} locally, run:
        cd ${projectName}
        npm install
        npm run dev
`;
