import colors from "colors";
import { IFs, memfs } from "memfs";
import git from "isomorphic-git";
import http from "isomorphic-git/http/node/index.js";
import { parse, stringify } from "yaml";
import path from "path";
import {
    YamlClassConfiguration,
    YamlProjectConfiguration,
} from "../../yamlProjectConfiguration/v1.js";
import { CloudProviderIdentifier } from "../../models/cloudProviderIdentifier.js";
import nativeFs from "fs";
import { setLinkPathForProject } from "../../utils/linkDatabase.js";
import log from "loglevel";
import { platform } from "os";
import { GenezioCreateOptions } from "../../models/commandOptions.js";
import { debugLogger, doAdaptiveLogAction } from "../../utils/logging.js";
import { packageManagers } from "../../packageManagers/packageManager.js";
import { backendTemplates, frontendTemplates } from "./templates.js";

type ProjectInfo = {
    name: string;
    region: string;
    type: "backend" | "frontend";
    templateId: string;
};

type FullstackProjectInfo = {
    name: string;
    region: string;
    backend: string;
    frontend: string;
    multirepo: boolean;
};

export async function createCommand(options: GenezioCreateOptions) {
    const { fs } = memfs();

    checkProjectName(options.name);
    const projectPath = options.path ?? path.join(process.cwd(), options.name);
    checkPathIsEmpty(projectPath);

    switch (options.type) {
        case "fullstack": {
            await doAdaptiveLogAction("Cloning fullstack starter template", async () => {
                // Create the new project in a virtual filesystem (memfs)
                await createFullstackProject(fs, options);

                // Copy from memfs to local filesystem
                copyRecursiveToNativeFs(fs, "/", projectPath, {
                    keepDotGit: true,
                    renameReadme: true,
                });
            });

            // Install template packages
            await doAdaptiveLogAction("Installing template dependencies", async () =>
                Promise.all([
                    installTemplatePackages(
                        backendTemplates[options.backend]?.pkgManager,
                        path.join(projectPath, "server"),
                    ),
                    installTemplatePackages(
                        frontendTemplates[options.frontend]?.pkgManager,
                        path.join(projectPath, "client"),
                    ),
                ]),
            );

            if (frontendTemplates[options.frontend] === undefined) {
                log.info(SUCCESSFULL_CREATE_NO_FRONTEND(projectPath));
                break;
            }

            // Print success message
            switch (options.multirepo) {
                case false:
                    log.info(SUCCESSFULL_CREATE_MONOREPO(projectPath, options.name));
                    break;
                case true:
                    // Genezio link inside the client project
                    await setLinkPathForProject(
                        options.name,
                        options.region,
                        path.join(projectPath, "client"),
                    );
                    log.info(SUCCESSFULL_CREATE_MULTIREPO(projectPath, options.name));
                    break;
            }

            break;
        }
        case "backend": {
            const projectInfo: ProjectInfo = {
                name: options.name,
                region: options.region,
                type: "backend",
                templateId: options.backend,
            };

            await doAdaptiveLogAction("Cloning backend starter template", async () => {
                // Create the new project in a virtual filesystem (memfs)
                await createProject(fs, projectInfo);

                // Copy from memfs to local filesystem
                copyRecursiveToNativeFs(fs, "/", projectPath, {
                    keepDotGit: true,
                    renameReadme: true,
                });
            });

            // Install template packages
            await doAdaptiveLogAction("Installing template dependencies", async () =>
                installTemplatePackages(backendTemplates[options.backend].pkgManager, projectPath),
            );

            // Print success message
            log.info(SUCCESSFULL_CREATE_BACKEND(projectPath, options.name));
            break;
        }
    }
}

/**
 * Checks if the provided project name is valid and if a folder with the same name already exists.
 *
 * @param projectName - The name of the project to be checked.
 * @throws Error if the project name is invalid or if a folder with the same name already exists.
 */
export function checkProjectName(projectName: string) {
    const projectNameRegex = /^[a-zA-Z][a-zA-Z0-9-]+$/;
    if (!projectNameRegex.test(projectName)) {
        throw new Error(
            "Project name must start with a letter and contain only letters, numbers and dashes",
        );
    }
}

export function checkPathIsEmpty(projectPath: string) {
    if (nativeFs.existsSync(projectPath)) {
        // If the project contains only a README.md/README or a .git folder, it's safe to continue
        const files = nativeFs.readdirSync(projectPath);
        for (const file of files) {
            const allowedFiles = ["README.md", "README", ".git", ".gitignore", "LICENSE"];
            if (!allowedFiles.includes(file)) {
                throw new Error(
                    `A folder named '${projectPath}' already exists. You can't create a project in a non-empty folder.`,
                );
            }
        }
    }
}

/**
 * Creates a fullstack project by cloning template repositories, replacing placeholders, and initializing a git repository.
 * Clones the backend in /server and the frontend in /client.
 *
 * If multirepo is true, it creates two separate repositories for the backend and frontend.
 *
 * @param fs - The file system module.
 * @param fullstackProjectOpts - The project information.
 * @returns A promise that resolves when the project creation is complete.
 */
async function createFullstackProject(
    fs: IFs,
    fullstackProjectOpts: Required<FullstackProjectInfo>,
) {
    const backendProjectInfo: ProjectInfo = {
        name: fullstackProjectOpts.name,
        region: fullstackProjectOpts.region,
        type: "backend",
        templateId: fullstackProjectOpts.backend,
    };
    const frontendProjectInfo: ProjectInfo = {
        name: fullstackProjectOpts.name,
        region: fullstackProjectOpts.region,
        type: "frontend",
        templateId: fullstackProjectOpts.frontend,
    };

    if (!fullstackProjectOpts.multirepo) {
        debugLogger.debug("Creating fullstack monorepo project");

        await createProject(fs, backendProjectInfo, "/server");
        await fs.promises.rmdir("/server/.git", { recursive: true });

        // Delete .genezioignore from server as we will create a new .genezioignore file in root
        if (fs.existsSync("/server/.genezioignore")) {
            fs.rmSync("/server/.genezioignore");
        }

        // Create frontend, but provide only backend-compatible templates
        if (frontendTemplates[fullstackProjectOpts.frontend] !== undefined) {
            await createProject(fs, frontendProjectInfo, "/client");
            await fs.promises.rmdir("/client/.git", { recursive: true });
        }

        // Create workspace genezio.yaml
        await createWorkspaceYaml(fs, fullstackProjectOpts, "/server", "/client");
        // Replace placeholders in genezio.yaml
        await replacePlaceholders(fs, "/genezio.yaml", {
            "(•◡•)project-name(•◡•)": fullstackProjectOpts.name,
            "(•◡•)region(•◡•)": fullstackProjectOpts.region,
        });

        // Create .genezioignore file that ignores the client folder and the .git folder
        fs.writeFileSync("/.genezioignore", "client\n.git\n");

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
    } else {
        debugLogger.debug("Creating fullstack multirepo project");

        await createProject(fs, backendProjectInfo, "/server");
        if (frontendTemplates[fullstackProjectOpts.frontend] !== undefined) {
            await createProject(fs, frontendProjectInfo, "/client");
        }
    }
}

/**
 * Creates a new project by cloning a template repository, replacing placeholders, and initializing a git repository.
 *
 * @param fs - The file system module.
 * @param projectInfo - The information about the project.
 * @param projectPath - The path where the project will be created. Defaults to the root directory ("/").
 * @returns A promise that resolves when the project creation is complete.
 */
async function createProject(fs: IFs, projectInfo: ProjectInfo, projectPath = "/") {
    const templateRepository = `https://github.com/Genez-io/${projectInfo.templateId}-${projectInfo.type}-starter`;

    debugLogger.debug(`Cloning ${templateRepository}`);
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
    fullstackProjectOpts: FullstackProjectInfo,
    backendPath: string,
    frontendPath: string,
) {
    const backendConfiguration = await readConfiguration(
        fs,
        path.join(backendPath, "genezio.yaml"),
    );
    fs.rmSync(path.join(backendPath, "genezio.yaml"));
    let frontendConfiguration: YamlProjectConfiguration | undefined;
    if (frontendTemplates[fullstackProjectOpts.frontend] === undefined) {
        frontendConfiguration = undefined;
    } else {
        frontendConfiguration = await readConfiguration(
            fs,
            path.join(frontendPath, "genezio.yaml"),
        );
        fs.rmSync(path.join(frontendPath, "genezio.yaml"));
    }

    const workspaceBackendPath = backendPath.startsWith(path.parse(backendPath).root)
        ? backendPath.slice(path.parse(backendPath).root.length)
        : backendPath;
    const workspaceFrontendPath = frontendPath.startsWith(path.parse(frontendPath).root)
        ? frontendPath.slice(path.parse(frontendPath).root.length)
        : frontendPath;

    const backendScripts = backendConfiguration.scripts;

    const workspaceConfiguration = new YamlProjectConfiguration(
        /* name: */ fullstackProjectOpts.name,
        /* region: */ fullstackProjectOpts.region,
        /* language: */ backendConfiguration.language,
        /* sdk: */ undefined,
        /* cloudProvider: */ CloudProviderIdentifier.GENEZIO,
        /* classes: */ backendConfiguration.classes
            .filter((e) => !e.fromDecorator)
            .map(
                (e) =>
                    ({
                        name: e.name,
                        type: e.type,
                        path: path.join(workspaceBackendPath, e.path),
                        language: e.language,
                        methods: e.methods.length > 0 ? e.methods : undefined,
                    }) as YamlClassConfiguration,
            ),
        /* frontend: */ frontendConfiguration?.frontend?.path
            ? { path: path.join(workspaceFrontendPath, frontendConfiguration.frontend?.path) }
            : undefined,
        /* scripts: */ {
            preFrontendDeploy: frontendConfiguration?.scripts?.preFrontendDeploy,
            postFrontendDeploy: frontendConfiguration?.scripts?.postFrontendDeploy,
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

/**
 * Replaces placeholders in files with corresponding values.
 * If the given path is a directory, it recursively replaces placeholders in all files within the directory.
 * If the given path is a file, it replaces placeholders in the file content.
 *
 * @param fs - The file system module.
 * @param replacePath - The path to the file or directory where placeholders should be replaced.
 * @param placeholders - An object containing placeholder-value pairs.
 */
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

/**
 * Installs template packages based on the specified language.
 *
 * If the package manager fails to install the packages, the error is ignored
 * because it's not considered critical.
 *
 * Note: It currently only supports JavaScript and TypeScript.
 *
 * @param language The programming language for which to install the packages.
 * @param path The path where the packages should be installed.
 */
async function installTemplatePackages(packageManager: string | undefined, path: string) {
    try {
        switch ((packageManager ?? "").toLowerCase()) {
            case "npm":
                await packageManagers.npm.install([], path);
                break;
            case "yarn":
                await packageManagers.yarn.install([], path);
                break;
            case "pnpm":
                await packageManagers.pnpm.install([], path);
                break;
        }
    } catch {
        // Fail silently
        debugLogger.debug(`Failed to install packages using ${packageManager} for ${path}`);
    }
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

const SUCCESSFULL_CREATE_NO_FRONTEND = (
    projectPath: string,
) => `Project initialized in ${projectPath}.

    You chose not to create a frontend from one of our templates.
    If you want to add a frontend later, place the code in the 'client' folder.
`;
