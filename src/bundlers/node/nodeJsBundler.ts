import path from "path";
import os from "os";
import fs from "fs";
import {
    createTemporaryFolder,
    deleteFolder,
    getAllFilesFromPath,
    writeToFile,
} from "../../utils/file.js";
import { BundlerInput, BundlerInterface, BundlerOutput, Dependency } from "../bundler.interface.js";
import FileDetails from "../../models/fileDetails.js";
import { default as fsExtra } from "fs-extra";
import { lambdaHandlerGenerator } from "./lambdaHandlerGenerator.js";
import { genezioRuntimeHandlerGenerator } from "./genezioRuntimeHandlerGenerator.js";
import { log } from "../../utils/logging.js";
import { debugLogger } from "../../utils/logging.js";
import esbuild, { BuildResult, Plugin, BuildFailure, Message, Loader } from "esbuild";
import { nodeExternalsPlugin } from "esbuild-node-externals";
import colors from "colors";
import { DependencyInstaller } from "./dependencyInstaller.js";
import { GENEZIO_NOT_ENOUGH_PERMISSION_FOR_FILE, UserError } from "../../errors.js";
import transformDecorators from "../../utils/transformDecorators.js";
import { spawnSync } from "child_process";
import { generateNodeContainerManifest } from "./containerManifest.js";
import { clusterWrapperCode } from "./clusterHandler.js";
import { CloudProviderIdentifier } from "../../models/cloudProviderIdentifier.js";
import { clusterHandlerGenerator } from "./clusterHandlerGenerator.js";
import { DEFAULT_NODE_RUNTIME } from "../../models/projectOptions.js";

export class NodeJsBundler implements BundlerInterface {
    async #copyDependencies(
        dependenciesInfo: Dependency[] | undefined,
        tempFolderPath: string,
        mode: "development" | "production",
        cwd: string,
    ) {
        const nodeModulesPath = path.join(tempFolderPath, "node_modules");

        if (mode === "development") {
            // copy node_modules folder to tmp folder if node_modules folder does not exist
            if (!fs.existsSync(nodeModulesPath) && fs.existsSync(path.join(cwd, "node_modules"))) {
                await fsExtra.copy(path.join(cwd, "node_modules"), nodeModulesPath);
            }
            return;
        }

        // Copy all dependencies from node_modules folder to tmp/node_modules folder
        if (!dependenciesInfo) {
            await fsExtra.copy(path.join(cwd, "node_modules"), nodeModulesPath);
            return;
        }

        // Copy only required dependencies from node_modules folder to tmp/node_modules folder
        await Promise.all(
            dependenciesInfo.map((dependency: Dependency) => {
                const dependencyPath = path.join(nodeModulesPath, dependency.name);
                return fsExtra.copy(dependency.path, dependencyPath);
            }),
        );
    }

    async #copyNonJsFiles(tempFolderPath: string, bundlerInput: BundlerInput, cwd: string) {
        const allNonJsFilesPaths = (await getAllFilesFromPath(cwd)).filter((file: FileDetails) => {
            // create a regex to match any .env files
            const envFileRegex = new RegExp(/\.env(\..+)?$/);

            const folderPath = path.join(cwd, file.path);
            // filter js files, node_modules and folders
            return (
                file.extension !== ".ts" &&
                file.extension !== ".js" &&
                file.extension !== ".tsx" &&
                file.extension !== ".jsx" &&
                !file.path.includes("node_modules") &&
                !file.path.includes(".git") &&
                !envFileRegex.test(file.path) &&
                !fs.lstatSync(folderPath).isDirectory()
            );
        });

        bundlerInput.extra.allNonJsFilesPaths = allNonJsFilesPaths;

        // iterate over all non js files and copy them to tmp folder
        await Promise.all(
            allNonJsFilesPaths.map((filePath: FileDetails) => {
                // create folder structure in tmp folder
                const folderPath = path.join(tempFolderPath, path.dirname(filePath.path));
                if (!fs.existsSync(folderPath)) {
                    fs.mkdirSync(folderPath, { recursive: true });
                }

                // copy file to tmp folder
                const fileDestinationPath = path.join(tempFolderPath, filePath.filename);
                const sourceFilePath = path.join(cwd, filePath.path);
                return fs.promises.copyFile(sourceFilePath, fileDestinationPath).catch((error) => {
                    if (error.code === "EACCES") {
                        throw new UserError(GENEZIO_NOT_ENOUGH_PERMISSION_FOR_FILE(filePath.path));
                    }

                    throw error;
                });
            }),
        );
    }

    async #bundleNodeJSCode(
        filePath: string,
        tempFolderPath: string,
        cwd: string = process.cwd(),
    ): Promise<void> {
        const outputFile = `module.mjs`;

        // delete module.js file if it exists
        if (fs.existsSync(path.join(tempFolderPath, outputFile))) {
            fs.unlinkSync(path.join(tempFolderPath, outputFile));
        }

        // Esbuild plugin that appends the following lines to the top of the file after it is bundled:
        // import { createRequire } from 'module';
        // const require = createRequire(import.meta.url);
        const supportRequireInESM: Plugin = {
            name: "esbuild-require-plugin",
            setup(build) {
                build.onLoad({ filter: /\.m?[jt]sx?$/ }, async (args) => {
                    function getLoader(extension: string): Loader {
                        switch (extension) {
                            case "ts":
                            case "mts":
                                return "ts";
                            case "tsx":
                            case "mtsx":
                                return "tsx";
                            case "js":
                            case "mjs":
                                return "js";
                            case "jsx":
                            case "mjsx":
                                return "jsx";
                            default:
                                return "js";
                        }
                    }

                    const relativePath = path.relative(cwd, args.path);
                    const components = relativePath.split(path.sep);
                    const contents = await fs.promises.readFile(args.path, "utf8");
                    const loader = getLoader(args.path.split(".").pop()!);

                    // Check if file comes from node_modules
                    if (components.length >= 1 && components.includes("node_modules")) {
                        return { contents, loader };
                    }

                    // Check if file doesn't use require()
                    if (!contents.includes("require(")) {
                        return { contents, loader };
                    }

                    // Check if file uses require() for relative paths
                    const regex = /require\(['"]\.\.?(?:\/[\w.-]+)+['"]\);?/g;
                    const lineContents = contents.split(os.EOL);
                    for (let i = 0; i < lineContents.length; i++) {
                        const line = lineContents[i];
                        if (regex.test(line)) {
                            return {
                                errors: [
                                    {
                                        text: `genezio does not support require() for relative paths. Please use import statements instead. For example: "const a = require("./b");" should be "import a from "./b";" or "const a = await import("./b");"`,
                                        location: {
                                            file: args.path,
                                            namespace: "file",
                                            lineText: line,
                                            line: i + 1,
                                        },
                                    },
                                ],
                            };
                        }
                    }
                    return {
                        contents: `import { createRequire } from 'module';
                    const require = createRequire(import.meta.url);
                    ${contents}`,
                        loader,
                    };
                });
            },
        };
        const outputFilePath = path.join(tempFolderPath, outputFile);

        /*
         * ESBuild uses `package.json` file to determine which modules are external.
         * If the file is not provided, all packages will be bundled and none will be external.
         * We don't want this because it increases the size of the bundle. So, if
         * the `package.json` file exists, we inform ESBuild about it.
         */
        let nodeExternalPlugin;
        if (fs.existsSync(path.join(cwd, "package.json"))) {
            nodeExternalPlugin = nodeExternalsPlugin({
                packagePath: path.join(cwd, "package.json"),
            });
        } else {
            nodeExternalPlugin = nodeExternalsPlugin();
        }

        // eslint-disable-next-line no-async-promise-executor
        const output: BuildResult = await esbuild.build({
            entryPoints: [filePath],
            bundle: true,
            metafile: true,
            format: "esm",
            platform: "node",
            outfile: outputFilePath,
            plugins: [nodeExternalPlugin, supportRequireInESM],
            sourcemap: "inline",
            sourcesContent: false,
        });

        if (output.errors.length > 0) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            output.errors.forEach((error: any) => {
                log.error("\x1b[31m", "Syntax error:");

                if (error.moduleIdentifier?.includes("|")) {
                    log.info(
                        "\x1b[37m",
                        "file: " +
                            error.moduleIdentifier?.split("|")[1] +
                            ":" +
                            error.loc?.split(":")[0],
                    );
                } else {
                    log.info("file: " + error.moduleIdentifier + ":" + error.loc?.split(":")[0]);
                }

                // get first line of error
                const firstLine = error.message.split("\n")[0];
                log.info(firstLine);

                //get message line that contains '>' first character
                const messageLine: string = error.message
                    .split("\n")
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    .filter((line: any) => line.startsWith(">") || line.startsWith("|"))
                    .join("\n");
                if (messageLine) {
                    log.info(messageLine);
                }
            });
            throw "Compilation failed";
        }

        const transformedCode = await transformDecorators(outputFilePath);

        fs.writeFileSync(outputFilePath, transformedCode);
    }

    async #handleMissingDependencies(
        error: BuildFailure,
        try_count: number,
        MAX_TRIES: number,
        cwd: string,
    ) {
        // If there is a build failure, check if it is caused by missing library dependencies
        // If it is, install them and try again
        const resolveRegex = /Could not resolve "(?<dependencyName>.+)"/;
        let npmInstallRequired = false;
        const errToDeps = error.errors.map((error: Message) => {
            const regexGroups = resolveRegex.exec(error.text)?.groups;
            const packageName = regexGroups ? regexGroups["dependencyName"] : undefined;
            if (packageName && !error.location?.file.includes("node_modules/")) {
                npmInstallRequired = true;
                return null;
            }

            return packageName;
        });
        const libraryDependencies: string[] = errToDeps.filter(
            (dependencyName: string | undefined | null): dependencyName is string =>
                !!dependencyName,
        );

        if (try_count >= MAX_TRIES) {
            if (libraryDependencies.length > 0 || npmInstallRequired) {
                log.info(
                    `You have some missing dependencies. If you want to install them automatically, please run with ${colors.green(
                        "--install-deps",
                    )} flag`,
                );
            }
            throw error;
        }

        const dependencyInstaller: DependencyInstaller = new DependencyInstaller();

        if (npmInstallRequired) {
            await dependencyInstaller.installAll(cwd);
        }

        if (libraryDependencies.length > 0) {
            await dependencyInstaller.install(libraryDependencies, cwd, true);
        }

        if (
            errToDeps.some(
                (dependencyName: string | undefined | null) => dependencyName === undefined,
            )
        ) {
            throw error;
        }
    }

    async #getDependenciesInfo(filePath: string, bundlerInput: BundlerInput, cwd: string) {
        const tempFolderPath = await createTemporaryFolder();
        let output: BuildResult;
        let try_count = 0;
        let MAX_TRIES = -1;

        if (bundlerInput.extra.installDeps) {
            MAX_TRIES = 2;
        }

        // eslint-disable-next-line no-constant-condition
        while (true) {
            try {
                // Building with `metafile` field set to true will return a JSON object with information about the dependencies
                output = await esbuild.build({
                    entryPoints: [filePath],
                    bundle: true,
                    metafile: true,
                    platform: "node",
                    outfile: path.join(tempFolderPath, "module.mjs"),
                    logLevel: "silent",
                    sourcemap: "inline",
                });
                break;
            } catch (error) {
                await this.#handleMissingDependencies(
                    error as BuildFailure,
                    try_count,
                    MAX_TRIES,
                    cwd,
                );
            }

            try_count++;
        }

        if (output.metafile === undefined) {
            throw new UserError("Could not get dependencies info");
        }

        const dependencyMap: Map<string, string> = new Map();
        Object.keys(output.metafile.inputs).forEach((value) => {
            // We are filtering out all the node_modules that are resolved outside of the
            // genezio backend framework. This is because we had problems in the past
            // where bundler was returning deps that were causing errors.
            if (value.startsWith("..") || !value.includes("node_modules")) {
                return;
            }

            // We use '/' as a separator regardless the platform because esbuild returns '/' separated paths
            // The name of the dependency is right after the "node_modules" component.
            const components = value.split("/");
            const dependencyName = components[components.indexOf("node_modules") + 1];
            const dependencyPath = path.resolve(path.join(cwd, "node_modules", dependencyName));

            // This should not ever happen. If you got here... Good luck!
            const existingDependencyPath = dependencyMap.get(dependencyName);
            if (existingDependencyPath !== undefined && existingDependencyPath !== dependencyPath) {
                throw new UserError(
                    `Dependency ${dependencyName} has two different paths: ${existingDependencyPath} and ${dependencyPath}`,
                );
            }

            dependencyMap.set(dependencyName, dependencyPath);
        });

        bundlerInput.extra.dependenciesInfo = Array.from(dependencyMap.entries()).map(
            ([name, path]) => ({ name, path }),
        );

        await deleteFolder(tempFolderPath);
    }

    getHandlerGeneratorForProvider(
        provider: CloudProviderIdentifier,
    ): ((className: string) => string) | null {
        switch (provider) {
            case CloudProviderIdentifier.GENEZIO_CLUSTER:
                return clusterHandlerGenerator;
            case CloudProviderIdentifier.GENEZIO_AWS:
                return lambdaHandlerGenerator;
            case CloudProviderIdentifier.GENEZIO_UNIKERNEL:
            case CloudProviderIdentifier.GENEZIO_CLOUD:
                return genezioRuntimeHandlerGenerator;
            default:
                return null;
        }
    }

    async bundle(input: BundlerInput): Promise<BundlerOutput> {
        const mode = input.extra.mode;
        const tmpFolder = input.extra.tmpFolder;
        const cwd = input.projectConfiguration.workspace?.backend || process.cwd();
        const cloudProvider = input.projectConfiguration.cloudProvider;

        // TODO: Remove this check after cluster is fully supported in other regions
        if (
            cloudProvider === CloudProviderIdentifier.GENEZIO_CLUSTER &&
            input.projectConfiguration.region !== "us-east-1"
        ) {
            throw new UserError(
                `While in ALPHA phase, persistent deployment is not supported in ${input.projectConfiguration.region} region. Please use us-east-1 region or use "genezio" as cloud provider.`,
            );
        }

        if (mode === "development" && !tmpFolder) {
            throw new UserError("tmpFolder is required in development mode.");
        }

        const handlerGenerator = this.getHandlerGeneratorForProvider(cloudProvider);
        if (handlerGenerator === null) {
            throw new UserError(`Can't generate handler for cloud provider ${cloudProvider}.`);
        }

        const temporaryFolder = mode === "production" ? await createTemporaryFolder() : tmpFolder!;
        input.extra.dependenciesInfo = [];

        // 1. Run esbuild to get dependenciesInfo and the bundled file
        debugLogger.debug(
            `[NodeJSBundler] Get the list of node modules and bundling the javascript code for file ${input.path}.`,
        );

        await Promise.all([
            this.#bundleNodeJSCode(
                input.configuration.path,
                temporaryFolder,
                input.projectConfiguration.workspace?.backend,
            ),
            mode === "development"
                ? this.#copyDependencies(undefined, temporaryFolder, mode, cwd)
                : Promise.resolve(),
            mode === "production" && input.extra.disableOptimization
                ? this.#copyDependencies(undefined, temporaryFolder, mode, cwd)
                : Promise.resolve(),
            mode === "production" && !input.extra.disableOptimization
                ? this.#getDependenciesInfo(input.configuration.path, input, cwd)
                : Promise.resolve(),
        ]);

        debugLogger.debug(
            `[NodeJSBundler] Copy non js files and node_modules for file ${input.path}.`,
        );

        const isDeployedToCluster = input.projectConfiguration.cloudProvider === "cluster";
        const nodeVersion = input.projectConfiguration.options?.nodeRuntime || DEFAULT_NODE_RUNTIME;

        // 2. Copy non js files and node_modules and write index.mjs file
        const entryFile = "index.mjs";
        await Promise.all([
            this.#copyNonJsFiles(temporaryFolder, input, cwd),
            mode === "production"
                ? this.#copyDependencies(input.extra.dependenciesInfo, temporaryFolder, mode, cwd)
                : Promise.resolve(),
            writeToFile(temporaryFolder, entryFile, handlerGenerator(input.configuration.name)),
            ...(isDeployedToCluster
                ? [
                      writeToFile(temporaryFolder, "local.mjs", clusterWrapperCode, true),
                      writeToFile(
                          temporaryFolder,
                          "Dockerfile",
                          generateNodeContainerManifest(nodeVersion),
                          true,
                      ),
                  ]
                : []),
        ]);

        if (isDeployedToCluster && mode === "production") {
            log.info("Writing docker file for container packaging and building image");
            // build image
            const dockerBuildProcess = spawnSync(
                "docker",
                [
                    "buildx",
                    "build",
                    "--load",
                    "--platform=linux/amd64",
                    "-t",
                    input.projectConfiguration.name + "-" + input.configuration.name.toLowerCase(),
                    temporaryFolder || ".",
                ],
                { cwd: temporaryFolder },
            );
            if (dockerBuildProcess.status !== 0) {
                throw new Error(
                    `Container image build failed, Docker daemon returned the following error: [${dockerBuildProcess.output}]`,
                );
            }
            log.info("Container image successfully built");
        }
        return {
            ...input,
            path: temporaryFolder,
            extra: {
                ...input.extra,
                originalPath: input.path,
                dependenciesInfo: input.extra.dependenciesInfo,
                allNonJsFilesPaths: input.extra.allNonJsFilesPaths,
                entryFile,
            },
        };
    }
}
