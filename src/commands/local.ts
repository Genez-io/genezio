import { NodeJsBundler } from "../bundlers/node/nodeJsBundler.js";
import { KotlinBundler } from "../bundlers/kotlin/localKotlinBundler.js";
import express, { Request, Response } from "express";
import chokidar from "chokidar";
import fs from "fs";
import fsPromises from "fs/promises";
import cors from "cors";
import bodyParser from "body-parser";
import { ChildProcess, spawn } from "child_process";
import path from "path";
import { default as fsExtra } from "fs-extra";
import url from "url";
import * as http from "http";
import colors from "colors";
import { ProjectConfiguration, ClassConfiguration } from "../models/projectConfiguration.js";
import {
    RECOMMENTDED_GENEZIO_TYPES_VERSION_RANGE,
    REQUIRED_GENEZIO_TYPES_VERSION_RANGE,
} from "../constants.js";
import { GENEZIO_NO_CLASSES_FOUND, PORT_ALREADY_USED } from "../errors.js";
import {
    SdkTypeMetadata,
    mapYamlClassToSdkClassConfiguration,
    sdkGeneratorApiHandler,
} from "../generateSdk/generateSdkApi.js";
import { AstSummary } from "../models/astSummary.js";
import { BundlerInterface } from "../bundlers/bundler.interface.js";
import { NodeJsLocalBundler } from "../bundlers/node/nodeJsLocalBundler.js";
import { BundlerComposer } from "../bundlers/bundlerComposer.js";
import { genezioRequestParser } from "../utils/genezioRequestParser.js";
import { debugLogger, doAdaptiveLogAction } from "../utils/logging.js";
import { rectifyCronString } from "../utils/rectifyCronString.js";
import cron from "node-cron";
import {
    createLocalTempFolder,
    createTemporaryFolder,
    deleteFolder,
    fileExists,
    readUTF8File,
} from "../utils/file.js";
import { replaceUrlsInSdk, writeSdkToDisk } from "../utils/sdk.js";
import { GenezioCommand, reportSuccess as _reportSuccess } from "../utils/reporter.js";
import { SdkGeneratorResponse } from "../models/sdkGeneratorResponse.js";
import { GenezioLocalOptions } from "../models/commandOptions.js";
import { DartBundler } from "../bundlers/dart/localDartBundler.js";
import axios, { AxiosError, AxiosResponse } from "axios";
import { findAvailablePort } from "../utils/findAvailablePort.js";
import { Language, SdkType, TriggerType } from "../yamlProjectConfiguration/models.js";
import { PackageManagerType } from "../packageManagers/packageManager.js";
import {
    YamlConfigurationIOController,
    YamlProjectConfiguration,
} from "../yamlProjectConfiguration/v2.js";
import hash from "hash-it";
import { GenezioTelemetry, TelemetryEventTypes } from "../telemetry/telemetry.js";
import dotenv from "dotenv";
import { TsRequiredDepsBundler } from "../bundlers/node/typescriptRequiredDepsBundler.js";
import inquirer, { Answers } from "inquirer";
import { DEFAULT_NODE_RUNTIME } from "../models/nodeRuntime.js";
import { getNodeModulePackageJsonLocal } from "../generateSdk/templates/packageJson.js";
import { compileSdk } from "../generateSdk/utils/compileSdk.js";
import { exit } from "process";
import { getLinkPathsForProject } from "../utils/linkDatabase.js";
import log from "loglevel";
import { interruptLocalPath } from "../utils/localInterrupt.js";
import { compareSync, Options, Result } from "dir-compare";
import {
    AwsApiGatewayRequest,
    CloudProviderIdentifier,
    LambdaResponse,
} from "../models/cloudProviderIdentifier.js";
import { GoBundler } from "../bundlers/go/localGoBundler.js";
import { importServiceEnvVariables } from "../utils/servicesEnvVariables.js";
import { isDependencyVersionCompatible } from "../utils/dependencyChecker.js";
import { scanClassesForDecorators } from "../utils/configuration.js";
import { runScript } from "../utils/scripts.js";

const POLLING_INTERVAL = 2000;

type ClassProcess = {
    process: ChildProcess;
    startingCommand: string;
    parameters: string[];
    listeningPort: number;
    envVars: dotenv.DotenvPopulateInput;
};

type BundlerRestartResponse = {
    shouldRestartBundling: boolean;
    bundlerOutput?: LocalBundlerOutput;
    watcher?: chokidar.FSWatcher;
};

type LocalBundlerOutput = {
    success: boolean;
    projectConfiguration: ProjectConfiguration;
    processForClasses: Map<string, ClassProcess>;
    sdk: SdkGeneratorResponse;
};

export async function prepareLocalBackendEnvironment(
    yamlProjectConfiguration: YamlProjectConfiguration,
    options: GenezioLocalOptions,
): Promise<BundlerRestartResponse> {
    try {
        const backend = yamlProjectConfiguration.backend;
        const frontend = yamlProjectConfiguration.frontend;
        let sdkLanguage: Language = Language.ts;
        if (frontend && Array.isArray(frontend)) {
            sdkLanguage = frontend[0].language;
        } else if (frontend) {
            sdkLanguage = frontend.language;
        }
        if (!backend) {
            throw new Error("No backend component found in the genezio.yaml file.");
        }
        backend.classes = await scanClassesForDecorators(backend);

        if (backend.classes.length === 0) {
            throw new Error(GENEZIO_NO_CLASSES_FOUND);
        }

        let metadata: SdkTypeMetadata;

        if (backend.sdk?.type === SdkType.package) {
            metadata = {
                type: SdkType.package,
                projectName: yamlProjectConfiguration.name,
                region: yamlProjectConfiguration.region,
            };
        } else {
            metadata = {
                type: SdkType.folder,
            };
        }

        const sdk = await sdkGeneratorApiHandler(
            metadata,
            backend.sdk?.language || sdkLanguage,
            mapYamlClassToSdkClassConfiguration(
                backend.classes,
                backend.language.name,
                backend.path,
            ),
            backend.path,
        ).catch((error) => {
            debugLogger.log("An error occurred", error);
            if (error.code === "ENOENT") {
                log.error(
                    `The file ${error.path} does not exist. Please check your genezio.yaml configuration and make sure that all the file paths are correct.`,
                );
            }

            throw error;
        });
        const projectConfiguration = new ProjectConfiguration(yamlProjectConfiguration, sdk);

        // Local deployments always use the genezio cloud provider
        projectConfiguration.cloudProvider = CloudProviderIdentifier.GENEZIO;

        const processForClasses = await startProcesses(projectConfiguration, sdk, options);
        return new Promise<BundlerRestartResponse>((resolve) => {
            resolve({
                shouldRestartBundling: false,
                bundlerOutput: {
                    success: true,
                    projectConfiguration,
                    processForClasses,
                    sdk,
                },
            });
        });
    } catch (error) {
        if (error instanceof Error) {
            log.error(error.message);
        }
        log.error(
            `Fix the errors and genezio local will restart automatically. Waiting for changes...`,
        );
        // If there was an error generating the SDK, wait for changes and try again.
        const { watcher } = await listenForChanges(undefined);
        logChangeDetection();
        return new Promise<BundlerRestartResponse>((resolve) => {
            resolve({
                shouldRestartBundling: true,
                bundlerOutput: undefined,
                watcher,
            });
        });
    }
}

// Function that starts the local environment.
// It also monitors for changes in the user's code and restarts the environment when changes are detected.
export async function startLocalEnvironment(options: GenezioLocalOptions) {
    await GenezioTelemetry.sendEvent({
        eventType: TelemetryEventTypes.GENEZIO_LOCAL,
        commandOptions: JSON.stringify(options),
    });
    const yamlConfigIOController = new YamlConfigurationIOController(options.config);
    const yamlProjectConfiguration = await yamlConfigIOController.read();
    const backendConfiguration = yamlProjectConfiguration.backend;
    if (!backendConfiguration) {
        throw new Error("No backend component found in the genezio.yaml file.");
    }
    const frontend = yamlProjectConfiguration.frontend;
    let sdkLanguage: Language = Language.ts;
    if (frontend && Array.isArray(frontend)) {
        sdkLanguage = frontend[0].language;
    } else if (frontend) {
        sdkLanguage = frontend.language;
    }

    // We need to check if the user is using an older version of @genezio/types
    // because we migrated the decorators implemented in the @genezio/types package to the stage 3 implementation.
    // Otherwise, the user will get an error at runtime. This check can be removed in the future once no one is using version
    // 0.1.* of @genezio/types.
    const packageJsonPath = path.join(backendConfiguration.path, "package.json");
    if (
        isDependencyVersionCompatible(
            packageJsonPath,
            "@genezio/types",
            REQUIRED_GENEZIO_TYPES_VERSION_RANGE,
        ) === false
    ) {
        log.error(
            `You are currently using an older version of @genezio/types, which is not compatible with this version of the genezio CLI. To solve this, please update the @genezio/types package on your backend component using the following command: npm install @genezio/types@${RECOMMENTDED_GENEZIO_TYPES_VERSION_RANGE}`,
        );
        exit(1);
    }

    const success = await doAdaptiveLogAction("Running backend local scripts", async () => {
        return await runScript(backendConfiguration.scripts?.local, backendConfiguration.path);
    });
    if (!success) {
        await GenezioTelemetry.sendEvent({
            eventType: TelemetryEventTypes.GENEZIO_PRE_START_LOCAL_SCRIPT_ERROR,
            commandOptions: JSON.stringify(options),
        });
        log.error("Backend `deploy` script failed.");
        exit(1);
    }

    let nodeModulesFolderWatcher: NodeJS.Timeout | undefined;

    // Check if a deployment is in progress and if it is, stop the local environment
    chokidar.watch(interruptLocalPath, { ignoreInitial: true }).on("all", async () => {
        log.info("A deployment is in progress. Stopping local environment...");
        exit(0);
    });

    // eslint-disable-next-line no-constant-condition
    while (true) {
        // Read the project configuration every time because it might change
        let yamlProjectConfiguration;
        try {
            yamlProjectConfiguration = await yamlConfigIOController.read();
        } catch (error) {
            if (error instanceof Error) {
                log.error(error.message);
            }
            log.error(
                `Fix the errors and genezio local will restart automatically. Waiting for changes...`,
            );
            // If there was an error while parsing using babel the decorated class, wait for changes and try again.
            const { watcher } = await listenForChanges(undefined);
            if (watcher) {
                watcher.close();
            }
            logChangeDetection();
            continue;
        }

        if (
            backendConfiguration.sdk &&
            !Language[backendConfiguration.sdk?.language as keyof typeof Language]
        ) {
            log.info(
                "This sdk.language is not supported by default. It will be treated as a custom language.",
            );
        }

        if (!backendConfiguration.language.packageManager && !backendConfiguration.sdk) {
            const optionalPackageManager: Answers = await inquirer.prompt([
                {
                    type: "list",
                    name: "packageManager",
                    message:
                        "Which package manager are you using to install your frontend dependencies?",
                    choices: Object.keys(PackageManagerType).filter((key) => isNaN(Number(key))),
                },
            ]);

            const yamlConfig = await yamlConfigIOController.read(/* fillDefaults= */ false);
            yamlConfig.backend!.language.packageManager = optionalPackageManager["packageManager"];
            await yamlConfigIOController.write(yamlConfig);
        }

        let sdkConfiguration = backendConfiguration.sdk;
        if (!sdkConfiguration) {
            const sdkPath = await createLocalTempFolder(
                `${yamlProjectConfiguration.name}-${yamlProjectConfiguration.region}`,
            );

            sdkConfiguration = {
                language: sdkLanguage,
                path: path.join(sdkPath, "sdk"),
                type: SdkType.folder,
            };
        }

        let sdk: SdkGeneratorResponse;
        let processForClasses: Map<string, ClassProcess>;
        let projectConfiguration: ProjectConfiguration;

        const promiseListenForChanges: Promise<BundlerRestartResponse> =
            listenForChanges(undefined);
        const bundlerPromise: Promise<BundlerRestartResponse> = prepareLocalBackendEnvironment(
            yamlProjectConfiguration,
            options,
        );

        let promiseRes: BundlerRestartResponse = await Promise.race([
            bundlerPromise,
            promiseListenForChanges,
        ]);

        if (promiseRes.shouldRestartBundling === false) {
            // There was no change in the user's code during the bundling process
            if (!promiseRes.bundlerOutput || promiseRes.bundlerOutput.success === false) {
                continue;
            }

            // bundling process finished successfully
            // assign the variables to the values of the bundling process output
            projectConfiguration = promiseRes.bundlerOutput.projectConfiguration;
            processForClasses = promiseRes.bundlerOutput.processForClasses;
            sdk = promiseRes.bundlerOutput.sdk;
        } else {
            // where was a change made by the user
            // so we need to restart the bundler process after the bundling process is finished
            promiseRes = await bundlerPromise;

            if (!promiseRes.bundlerOutput || promiseRes.bundlerOutput.success === false) {
                continue;
            }

            processForClasses = promiseRes.bundlerOutput.processForClasses;

            // clean up the old processes
            processForClasses.forEach((classProcess: ClassProcess) => {
                classProcess.process.kill();
            });

            if (promiseRes.watcher) {
                promiseRes.watcher.close();
            }
            logChangeDetection();
            continue;
        }

        // Start HTTP Server
        const server = await startServerHttp(
            options.port,
            projectConfiguration.astSummary,
            yamlProjectConfiguration.name,
            processForClasses,
        );

        // Start cron jobs
        const crons = startCronJobs(projectConfiguration, processForClasses);

        await replaceUrlsInSdk(
            sdk,
            sdk.files.map((c) => ({
                name: c.className,
                cloudUrl: `http://127.0.0.1:${options.port}/${c.className}`,
            })),
        );

        if (
            !backendConfiguration.sdk &&
            (sdkConfiguration.language === Language.ts || sdkConfiguration.language === Language.js)
        ) {
            await deleteFolder(sdkConfiguration.path);
            await writeSdkToDisk(sdk, sdkConfiguration.path);
            // compile the sdk
            const packageJson: string = getNodeModulePackageJsonLocal(
                projectConfiguration.name,
                projectConfiguration.region,
            );
            await compileSdk(sdkConfiguration.path, packageJson, sdkConfiguration.language, false);

            await writeSdkToNodeModules(yamlProjectConfiguration, sdkConfiguration.path);
            nodeModulesFolderWatcher = await watchNodeModules(
                yamlProjectConfiguration,
                sdkConfiguration.path,
            );
        } else {
            await deleteFolder(sdkConfiguration.path);
            await writeSdkToDisk(sdk, sdkConfiguration.path);
        }

        reportSuccess(projectConfiguration, sdk, options.port, !backendConfiguration.sdk);

        // Start listening for changes in user's code
        const { watcher } = await listenForChanges(projectConfiguration.sdk?.path);
        if (watcher) {
            watcher.close();
        }
        logChangeDetection();

        // When new changes are detected, close everything and restart the process
        clearAllResources(server, processForClasses, crons);
        await GenezioTelemetry.sendEvent({
            eventType: TelemetryEventTypes.GENEZIO_LOCAL_RELOAD,
            commandOptions: JSON.stringify(options),
        });
        clearTimeout(nodeModulesFolderWatcher);
    }
}

async function watchNodeModules(
    yamlProjectConfiguration: YamlProjectConfiguration,
    sdkPath: string,
): Promise<NodeJS.Timeout> {
    // We are watching for the following files:
    // - node_modules/@genezio-sdk/<projectName>_<region>/package.json: this file is used to determine if the SDK was changed (by a npm install or npm update)
    // - node_modules/.package-lock.json: this file is used by npm to determine if it should update the packages or not. We are removing this file while "genezio local"
    // is running, because we are modifying node_modules folder manual (reference: https://github.com/npm/cli/blob/653769de359b8d24f0d17b8e7e426708f49cadb8/docs/content/configuring-npm/package-lock-json.md#hidden-lockfiles)
    const watchPaths: string[] = [interruptLocalPath];
    const sdkName = `${yamlProjectConfiguration.name}_${yamlProjectConfiguration.region}`;
    const nodeModulesSdkDirectoryPath = path.join("node_modules", "@genezio-sdk", sdkName);

    if (yamlProjectConfiguration.frontend && !Array.isArray(yamlProjectConfiguration.frontend)) {
        yamlProjectConfiguration.frontend = [yamlProjectConfiguration.frontend];
    }
    const frontends = yamlProjectConfiguration.frontend || [];
    for (const f of frontends) {
        watchPaths.push(path.join(f.path, nodeModulesSdkDirectoryPath));
        watchPaths.push(path.join(f.path, "node_modules", ".package-lock.json"));
    }

    const linkPaths = await getLinkPathsForProject(
        yamlProjectConfiguration.name,
        yamlProjectConfiguration.region,
    );
    for (const linkPath of linkPaths) {
        watchPaths.push(path.join(linkPath, nodeModulesSdkDirectoryPath));
        watchPaths.push(path.join(linkPath, "node_modules", ".package-lock.json"));
    }

    return setInterval(async () => {
        for (const watchPath of watchPaths) {
            const components = watchPath.split(path.sep);

            // if the file is .package-lock.json, remove it
            if (
                components[components.length - 1] === ".package-lock.json" &&
                fs.existsSync(watchPath)
            ) {
                await fsPromises.unlink(watchPath).catch(() => {
                    debugLogger.debug(`[WATCH_NODE_MODULES] Error deleting ${watchPath}`);
                });
                return;
            }

            if (components[components.length - 1] === sdkName) {
                const genezioSdkPath = path.resolve(sdkPath, "..", "genezio-sdk");
                const options: Options = { compareContent: true };
                if (!fs.existsSync(watchPath)) {
                    fs.mkdirSync(watchPath, { recursive: true });
                }

                const res: Result = compareSync(genezioSdkPath, watchPath, options);
                if (!res.same) {
                    debugLogger.debug(`[WATCH_NODE_MODULES] Rewriting the SDK to node_modules...`);
                    await writeSdkToNodeModules(yamlProjectConfiguration, sdkPath);
                }
            }
        }
    }, POLLING_INTERVAL);
}

async function writeSdkToNodeModules(
    yamlProjectConfiguration: YamlProjectConfiguration,
    originSdkPath: string,
) {
    const writeSdk = async (from: string, toFinal: string) => {
        if (fs.existsSync(toFinal)) {
            if (fs.lstatSync(toFinal).isSymbolicLink()) {
                fs.unlinkSync(toFinal);
            }
            await deleteFolder(toFinal);
        }
        fs.mkdirSync(toFinal, { recursive: true });

        await fsExtra.copy(from, toFinal, { overwrite: true });
    };

    if (yamlProjectConfiguration.frontend && !Array.isArray(yamlProjectConfiguration.frontend)) {
        yamlProjectConfiguration.frontend = [yamlProjectConfiguration.frontend];
    }
    const from = path.resolve(originSdkPath, "..", "genezio-sdk");

    // Write the SDK to the node_modules folder of each frontend
    // A frontend can be explicitly declared in the genezio.yaml file or it can be linked to the project
    const frontendPaths = (yamlProjectConfiguration.frontend || [])
        .map((f) => f.path)
        .concat(
            await getLinkPathsForProject(
                yamlProjectConfiguration.name,
                yamlProjectConfiguration.region,
            ),
        );
    for (const frontendPath of frontendPaths) {
        const to = path.join(
            frontendPath,
            "node_modules",
            "@genezio-sdk",
            `${yamlProjectConfiguration.name}_${yamlProjectConfiguration.region}`,
        );

        await writeSdk(from, to).catch(() => {
            debugLogger.debug(`[WRITE_SDK_TO_NODE_MODULES] Error writing SDK to node_modules`);
        });
    }
}

function logChangeDetection() {
    console.clear();
    log.info("\x1b[36m%s\x1b[0m", "Change detected, reloading...");
}

/**
 * Bundle each class and start a new process for it.
 */
async function startProcesses(
    projectConfiguration: ProjectConfiguration,
    sdk: SdkGeneratorResponse,
    options: GenezioLocalOptions,
): Promise<Map<string, ClassProcess>> {
    const classes = projectConfiguration.classes;
    const processForClasses = new Map<string, ClassProcess>();

    // Bundle each class and start a new process for it
    const bundlersOutputPromise = classes.map(async (classInfo) => {
        const bundler = getBundler(classInfo);

        if (!bundler) {
            throw new Error("Unsupported language ${classConfiguration.language}.");
        }

        const astClass = sdk.sdkGeneratorInput.classesInfo.find(
            (c) => c.classConfiguration.path === classInfo.path,
        );
        if (astClass === undefined) {
            throw new Error("AST class not found.");
        }
        const ast = astClass.program;

        debugLogger.log("Start bundling...");
        const tmpFolder = await createTemporaryFolder(`${classInfo.name}-${hash(classInfo.path)}`);
        const bundlerOutput = await bundler.bundle({
            projectConfiguration,
            path: classInfo.path,
            ast: ast,
            genezioConfigurationFilePath: process.cwd(),
            configuration: classInfo,
            extra: {
                mode: "development",
                tmpFolder: tmpFolder,
                installDeps: options.installDeps,
            },
        });
        return bundlerOutput;
    });

    const bundlersOutput = await Promise.all(bundlersOutputPromise);
    await importServiceEnvVariables(projectConfiguration.name, projectConfiguration.region);

    const envVars: dotenv.DotenvPopulateInput = {};
    const envFile = projectConfiguration.workspace?.backend
        ? path.join(projectConfiguration.workspace.backend, ".env")
        : path.join(process.cwd(), ".env");
    dotenv.config({ path: options.env || envFile, processEnv: envVars });
    for (const bundlerOutput of bundlersOutput) {
        const extra = bundlerOutput.extra;

        if (!extra) {
            throw new Error("Bundler output is missing extra field.");
        }

        if (!extra.startingCommand) {
            throw new Error("No starting command found for this language.");
        }

        await startClassProcess(
            extra.startingCommand,
            extra.commandParameters ? extra.commandParameters : [],
            bundlerOutput.configuration.name,
            processForClasses,
            envVars,
        );
    }

    return processForClasses;
}

// Function that returns the correct bundler for the local environment based on language.
function getBundler(classConfiguration: ClassConfiguration): BundlerInterface | undefined {
    let bundler: BundlerInterface | undefined;
    switch (classConfiguration.language) {
        case "ts": {
            const requiredDepsBundler = new TsRequiredDepsBundler();
            const nodeJsBundler = new NodeJsBundler();
            const localBundler = new NodeJsLocalBundler();
            bundler = new BundlerComposer([requiredDepsBundler, nodeJsBundler, localBundler]);
            break;
        }
        case "js": {
            const nodeJsBundler = new NodeJsBundler();
            const localBundler = new NodeJsLocalBundler();
            bundler = new BundlerComposer([nodeJsBundler, localBundler]);
            break;
        }
        case "dart": {
            bundler = new DartBundler();
            break;
        }
        case "kt": {
            bundler = new KotlinBundler();
            break;
        }
        case "go": {
            bundler = new GoBundler();
            break;
        }
        default: {
            log.error(`Unsupported language ${classConfiguration.language}. Skipping class `);
        }
    }

    return bundler;
}

async function startServerHttp(
    port: number,
    astSummary: AstSummary,
    projectName: string,
    processForClasses: Map<string, ClassProcess>,
): Promise<http.Server> {
    const app = express();
    const __filename = url.fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    app.use(cors());
    app.use(bodyParser.raw({ type: () => true, limit: "6mb" }));
    app.use(genezioRequestParser);

    // serve test interface built folder on localhost
    const buildFolder = path.resolve(
        __dirname,
        "../../../node_modules/@genezio/test-interface-component/dist/build",
    );
    app.use(express.static(buildFolder));
    app.get(`/explore`, (req, res) => {
        const filePath = path.join(buildFolder, "index.html");
        res.sendFile(filePath);
    });

    app.get("/get-ast-summary", (req, res) => {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ ...astSummary, name: projectName }));
    });

    app.all(`/:className`, async (req, res) => {
        const reqToFunction = getEventObjectFromRequest(req);

        const localProcess = processForClasses.get(req.params.className);

        if (!localProcess) {
            sendResponse(res, {
                body: JSON.stringify({
                    jsonrpc: "2.0",
                    id: 0,
                    error: { code: -32000, message: "Class not found!" },
                }),
                isBase64Encoded: false,
                statusCode: "200",
                statusDescription: "200 OK",
                headers: {
                    "content-type": "application/json",
                },
            });
            return;
        }

        try {
            const response = await communicateWithProcess(
                localProcess,
                req.params.className,
                reqToFunction,
                processForClasses,
            );
            sendResponse(res, response.data);
        } catch (error) {
            sendResponse(res, {
                body: JSON.stringify({
                    jsonrpc: "2.0",
                    id: 0,
                    error: { code: -32000, message: "Internal error" },
                }),
                isBase64Encoded: false,
                statusCode: "200",
                statusDescription: "200 OK",
                headers: {
                    "content-type": "application/json",
                },
            });
            return;
        }
    });

    async function handlerHttpMethod(
        req: Request<{ className: string; methodName: string }>,
        res: Response,
    ) {
        const reqToFunction = getEventObjectFromRequest(req);

        const localProcess = processForClasses.get(req.params.className);

        if (!localProcess) {
            res.status(404).send(`Class ${req.params.className} not found.`);
            return;
        }

        const response = await communicateWithProcess(
            localProcess,
            req.params.className,
            reqToFunction,
            processForClasses,
        );
        sendResponse(res, response.data);
    }

    app.all(`/:className/:methodName`, async (req, res) => {
        await handlerHttpMethod(req, res);
    });

    app.all(`/:className/:methodName/*`, async (req, res) => {
        await handlerHttpMethod(req, res);
    });

    return await new Promise((resolve, reject) => {
        const server = app.listen(port, () => {
            log.info(`Server listening on port ${port}`);
            resolve(server);
        });

        server.on("error", (error) => {
            const err = error as NodeJS.ErrnoException;
            if (err.code === "EADDRINUSE") {
                reject(new Error(PORT_ALREADY_USED(port)));
            }

            reject(error);
        });
    });
}

export type LocalEnvCronHandler = {
    className: string;
    methodName: string;
    cronString: string;
    cronObject: cron.ScheduledTask | null;
    process: ClassProcess;
};

function startCronJobs(
    projectConfiguration: ProjectConfiguration,
    processForClasses: Map<string, ClassProcess>,
): LocalEnvCronHandler[] {
    const cronHandlers: LocalEnvCronHandler[] = [];
    for (const classElement of projectConfiguration.classes) {
        const methods = classElement.methods;
        for (const method of methods) {
            if (method.type === TriggerType.cron && method.cronString) {
                const cronHandler: LocalEnvCronHandler = {
                    className: classElement.name,
                    methodName: method.name,
                    cronString: rectifyCronString(method.cronString),
                    cronObject: null,
                    process: processForClasses.get(classElement.name)!,
                };

                cronHandler.cronObject = cron.schedule(cronHandler.cronString, () => {
                    const reqToFunction = {
                        genezioEventType: "cron",
                        methodName: cronHandler.methodName,
                        cronString: cronHandler.cronString,
                    };

                    void communicateWithProcess(
                        cronHandler.process,
                        cronHandler.className,
                        reqToFunction,
                        processForClasses,
                    );
                });

                cronHandler.cronObject.start();
                cronHandlers.push(cronHandler);
            }
        }
    }

    return cronHandlers;
}

async function stopCronJobs(cronHandlers: LocalEnvCronHandler[]) {
    for (const cronHandler of cronHandlers) {
        if (cronHandler.cronObject) {
            await cronHandler.cronObject.stop();
        }
    }
}

function getEventObjectFromRequest(request: AwsApiGatewayRequest) {
    const urlDetails = url.parse(request.url, true);

    return {
        headers: request.headers,
        rawQueryString: urlDetails.search ? urlDetails.search?.slice(1) : "",
        queryStringParameters: urlDetails.search ? Object.assign({}, urlDetails.query) : undefined,
        timeEpoch: Date.now(),
        body: request.body,
        isBase64Encoded: request.isBase64Encoded,
        requestContext: {
            http: {
                method: request.method,
                path: urlDetails.pathname,
                protocol: request.httpVersion,
                sourceIp: request.socket.remoteAddress,
                userAgent: request.headers["user-agent"],
            },
        },
    };
}

function sendResponse(res: Response, httpResponse: LambdaResponse) {
    if (httpResponse.statusDescription) {
        res.statusMessage = httpResponse.statusDescription;
    }
    let contentTypeHeader = false;

    if (httpResponse.headers) {
        for (const header of Object.keys(httpResponse.headers)) {
            const headerContent = httpResponse.headers[header];
            if (headerContent !== undefined) {
                res.setHeader(header.toLowerCase(), headerContent);
            }

            if (header.toLowerCase() === "content-type") {
                contentTypeHeader = true;
            }
        }
    }

    if (!contentTypeHeader) {
        res.setHeader("content-type", "application/json");
    }

    if (httpResponse.statusCode) {
        res.writeHead(parseInt(httpResponse.statusCode));
    }

    if (httpResponse.isBase64Encoded === true) {
        res.end(Buffer.from(httpResponse.body, "base64"));
    } else {
        if (Buffer.isBuffer(httpResponse.body)) {
            res.end(JSON.stringify(httpResponse.body.toJSON()));
        } else {
            res.end(httpResponse.body ? httpResponse.body : "");
        }
    }
}

async function listenForChanges(sdkPathRelative: string | undefined) {
    const cwd = process.cwd();

    let sdkPath: string | null = null;

    if (sdkPathRelative) {
        sdkPath = path.join(cwd, sdkPathRelative);
    }

    let ignoredPathsFromGenezioIgnore: string[] = [];

    // check for .genezioignore file
    const ignoreFilePath = path.join(cwd, ".genezioignore");
    if (await fileExists(ignoreFilePath)) {
        // read the file as a string
        const ignoreFile = await readUTF8File(ignoreFilePath);
        // split the string by newline - CRLF or LF
        const ignoreFileLines = ignoreFile.split(/\r?\n/);
        // remove empty lines
        const ignoreFileLinesWithoutEmptyLines = ignoreFileLines.filter(
            (line) => line !== "" && !line.startsWith("#"),
        );

        ignoredPathsFromGenezioIgnore = ignoreFileLinesWithoutEmptyLines.map((line: string) => {
            if (line.startsWith("/")) {
                return line;
            }
            return path.join(cwd, line);
        });
    }

    return new Promise<BundlerRestartResponse>((resolve) => {
        // delete / if sdkPath ends with /
        if (sdkPath?.endsWith("/")) {
            sdkPath = sdkPath.slice(0, -1);
        }

        // Watch for changes in the classes and update the handlers
        const watchPaths = [path.join(cwd, "/**/*")];
        let ignoredPaths: string[] = [];

        if (sdkPath) {
            ignoredPaths = [
                "**/node_modules/*",
                sdkPath + "/**/*",
                sdkPath + "/*",
                ...ignoredPathsFromGenezioIgnore,
            ];
        } else {
            ignoredPaths = ["**/node_modules/*", ...ignoredPathsFromGenezioIgnore];
        }

        const startWatching = () => {
            const watch = chokidar
                .watch(watchPaths, {
                    // Disable fsevents for macos
                    useFsEvents: false,
                    ignored: ignoredPaths,
                    ignoreInitial: true,
                })
                .on("all", async (_event, path) => {
                    if (sdkPath) {
                        if (path.includes(sdkPath)) {
                            return;
                        }
                    }
                    resolve({
                        shouldRestartBundling: true,
                        watcher: watch,
                    });
                });
        };
        startWatching();
    });
}

function reportSuccess(
    projectConfiguration: ProjectConfiguration,
    sdk: SdkGeneratorResponse,
    port: number,
    newVersion: boolean,
) {
    const classesInfo = projectConfiguration.classes.map((c) => ({
        className: c.name,
        methods: c.methods.map((m) => ({
            name: m.name,
            type: m.type,
            cronString: m.cronString,
            functionUrl: getFunctionUrl(`http://127.0.0.1:${port}`, m.type, c.name, m.name),
        })),
        functionUrl: `http://127.0.0.1:${port}/${c.name}`,
    }));

    // get installed version of node
    const nodeVersion = process.version;

    // get only the major version
    const nodeMajorVersion = nodeVersion.split(".")[0].slice(1);

    // get server used version
    let serverRuntime: string = DEFAULT_NODE_RUNTIME as string;
    if (projectConfiguration.options?.nodeRuntime) {
        serverRuntime = projectConfiguration.options.nodeRuntime;
    }

    const serverVersion = serverRuntime.split(".")[0].split("nodejs")[1];

    debugLogger.debug(`Node version: ${nodeVersion}`);
    debugLogger.debug(`Server version: ${serverRuntime}`);

    // check if server version is different from installed version
    if (nodeMajorVersion !== serverVersion) {
        log.warn(
            `${colors.yellow(`Warning: You are using node version ${nodeVersion} but your server is configured to use ${serverRuntime}. This might cause unexpected behavior.
To change the server version, go to your ${colors.cyan(
                "genezio.yaml",
            )} file and change the ${colors.cyan(
                "backend.lanuage.nodeRuntime",
            )} property to the version you want to use.`)}`,
        );
    }
    _reportSuccess(
        classesInfo,
        sdk,
        GenezioCommand.local,
        {
            name: projectConfiguration.name,
            region: projectConfiguration.region,
        },
        newVersion,
    );

    log.info(colors.cyan(`Test your code at http://localhost:${port}/explore`));
}

function getFunctionUrl(
    baseUrl: string,
    methodType: string,
    className: string,
    methodName: string,
): string {
    if (methodType === "http") {
        return `${baseUrl}/${className}/${methodName}`;
    } else {
        return `${baseUrl}/${className}`;
    }
}

async function clearAllResources(
    server: http.Server,
    processForClasses: Map<string, ClassProcess>,
    crons: LocalEnvCronHandler[],
) {
    server.close();
    await stopCronJobs(crons);

    processForClasses.forEach((classProcess) => {
        classProcess.process.kill();
    });
}

async function startClassProcess(
    startingCommand: string,
    parameters: string[],
    className: string,
    processForClasses: Map<string, ClassProcess>,
    envVars: dotenv.DotenvPopulateInput = {},
) {
    const availablePort = await findAvailablePort();
    debugLogger.debug(`[START_CLASS_PROCESS] Starting class ${className} on port ${availablePort}`);
    debugLogger.debug(`[START_CLASS_PROCESS] Starting command: ${startingCommand}`);
    debugLogger.debug(`[START_CLASS_PROCESS] Parameters: ${parameters}`);
    const processParameters = [...parameters, availablePort.toString()];
    const classProcess = spawn(startingCommand, processParameters, {
        stdio: ["pipe", "pipe", "pipe"],
        env: {
            ...process.env,
            ...envVars,
            NODE_OPTIONS: "--enable-source-maps",
        },
    });
    classProcess.stdout.pipe(process.stdout);
    classProcess.stderr.pipe(process.stderr);

    processForClasses.set(className, {
        process: classProcess,
        listeningPort: availablePort,
        startingCommand: startingCommand,
        parameters: parameters,
        envVars: envVars,
    });
}

async function communicateWithProcess(
    localProcess: ClassProcess,
    className: string,
    data: Record<string, unknown>,
    processForClasses: Map<string, ClassProcess>,
): Promise<AxiosResponse> {
    try {
        return await axios.post(`http://127.0.0.1:${localProcess?.listeningPort}`, data);
    } catch (error) {
        if (
            error instanceof AxiosError &&
            (error.code === "ECONNRESET" || error.code === "ECONNREFUSED")
        ) {
            await startClassProcess(
                localProcess.startingCommand,
                localProcess.parameters,
                className,
                processForClasses,
                localProcess.envVars,
            );
        }
        throw error;
    }
}
