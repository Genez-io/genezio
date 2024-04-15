import express, { Request, Response } from "express";
import chokidar from "chokidar";
import cors from "cors";
import bodyParser from "body-parser";
import { ChildProcess, spawn } from "child_process";
import path from "path";
import url from "url";
import * as http from "http";
import colors from "colors";
import { createRequire } from "module";
import { ProjectConfiguration, ClassConfiguration } from "../models/projectConfiguration.js";
import {
    RECOMMENTDED_GENEZIO_TYPES_VERSION_RANGE,
    REQUIRED_GENEZIO_TYPES_VERSION_RANGE,
} from "../constants.js";
import { GENEZIO_NO_CLASSES_FOUND, PORT_ALREADY_USED, UserError } from "../errors.js";
import {
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
import { createTemporaryFolder, fileExists, readUTF8File } from "../utils/file.js";
import { GenezioCommand, reportSuccess as _reportSuccess } from "../utils/reporter.js";
import { SdkGeneratorResponse } from "../models/sdkGeneratorResponse.js";
import { GenezioLocalOptions } from "../models/commandOptions.js";
import { DartBundler } from "../bundlers/dart/localDartBundler.js";
import axios, { AxiosError, AxiosResponse } from "axios";
import { findAvailablePort } from "../utils/findAvailablePort.js";
import { Language, TriggerType } from "../yamlProjectConfiguration/models.js";
import {
    YAMLBackend,
    YamlConfigurationIOController,
    YamlFrontend,
    YamlProjectConfiguration,
} from "../yamlProjectConfiguration/v2.js";
import hash from "hash-it";
import { GenezioTelemetry, TelemetryEventTypes } from "../telemetry/telemetry.js";
import dotenv from "dotenv";
import { TsRequiredDepsBundler } from "../bundlers/node/typescriptRequiredDepsBundler.js";
import { DEFAULT_NODE_RUNTIME } from "../models/projectOptions.js";
import { exit } from "process";
import { log } from "../utils/logging.js";
import { interruptLocalPath } from "../utils/localInterrupt.js";
import {
    AwsApiGatewayRequest,
    CloudProviderIdentifier,
    LambdaResponse,
} from "../models/cloudProviderIdentifier.js";
import { LocalGoBundler } from "../bundlers/go/localGoBundler.js";
import { importServiceEnvVariables } from "../utils/servicesEnvVariables.js";
import {
    isDependencyVersionCompatible,
    checkExperimentalDecorators,
} from "../utils/jsProjectChecker.js";
import { scanClassesForDecorators } from "../utils/configuration.js";
import { runScript, runFrontendStartScript } from "../utils/scripts.js";
import { writeSdk } from "../generateSdk/sdkWriter/sdkWriter.js";
import { watchPackage } from "../generateSdk/sdkMonitor.js";
import { NodeJsBundler } from "../bundlers/node/nodeJsBundler.js";
import { KotlinBundler } from "../bundlers/kotlin/localKotlinBundler.js";
import { reportSuccessForSdk } from "../generateSdk/sdkSuccessReport.js";
import { getLinkPathsForProject } from "../utils/linkDatabase.js";
import { Mutex } from "async-mutex";

type ClassProcess = {
    process: ChildProcess;
    startingCommand: string;
    parameters: string[];
    listeningPort: number;
    envVars: dotenv.DotenvPopulateInput;
};

type ClassProcessSpawnResponse = {
    restartEnvironment: boolean;
    spawnOutput?: ClassProcessSpawnOutput;
    watcher?: chokidar.FSWatcher;
};

type ClassProcessSpawnOutput = {
    success: boolean;
    projectConfiguration: ProjectConfiguration;
    processForClasses: Map<string, ClassProcess>;
    sdk: SdkGeneratorResponse;
};

export async function prepareLocalBackendEnvironment(
    yamlProjectConfiguration: YamlProjectConfiguration,
    options: GenezioLocalOptions,
): Promise<ClassProcessSpawnResponse> {
    try {
        const backend = yamlProjectConfiguration.backend;
        const frontend = yamlProjectConfiguration.frontend;
        let sdkLanguage: Language = Language.ts;
        if (frontend) {
            for (const f of frontend) {
                if (f.sdk?.language) {
                    sdkLanguage = f.sdk.language;
                    break;
                }
            }
        }
        if (!backend) {
            throw new UserError("No backend component found in the genezio.yaml file.");
        }
        backend.classes = await scanClassesForDecorators(backend);

        if (backend.classes.length === 0) {
            throw new UserError(GENEZIO_NO_CLASSES_FOUND(backend.language.name));
        }

        const sdk = await sdkGeneratorApiHandler(
            sdkLanguage,
            mapYamlClassToSdkClassConfiguration(
                backend.classes,
                backend.language.name,
                backend.path,
            ),
            backend.path,
            /* packageName= */ `@genezio-sdk/${yamlProjectConfiguration.name}`,
        ).catch((error) => {
            debugLogger.debug("An error occurred", error);
            if (error.code === "ENOENT") {
                log.error(
                    `The file ${error.path} does not exist. Please check your genezio.yaml configuration and make sure that all the file paths are correct.`,
                );
            }

            throw error;
        });
        const projectConfiguration = new ProjectConfiguration(yamlProjectConfiguration, sdk);

        // Local deployments always use the genezio cloud provider unless the user uses the cluster deployment
        if (projectConfiguration.cloudProvider !== CloudProviderIdentifier.CLUSTER) {
            projectConfiguration.cloudProvider = CloudProviderIdentifier.GENEZIO;
        }

        const processForClasses = await startProcesses(projectConfiguration, sdk, options);
        return new Promise<ClassProcessSpawnResponse>((resolve) => {
            resolve({
                restartEnvironment: false,
                spawnOutput: {
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
        const { watcher } = await listenForChanges();
        logChangeDetection();
        return new Promise<ClassProcessSpawnResponse>((resolve) => {
            resolve({
                restartEnvironment: true,
                watcher,
            });
        });
    }
}

// Function that starts the local environment. It starts the backend watcher and the frontends.
export async function startLocalEnvironment(options: GenezioLocalOptions) {
    log.settings.prettyLogTemplate = `${colors.blue("|")} `;

    await GenezioTelemetry.sendEvent({
        eventType: TelemetryEventTypes.GENEZIO_LOCAL,
        commandOptions: JSON.stringify(options),
    });
    const yamlConfigIOController = new YamlConfigurationIOController(options.config);
    const yamlProjectConfiguration = await yamlConfigIOController.read();
    // This mutex is used to make the frontends wait until the first Genezio SDK is generated.
    const sdkSynchronizer = new Mutex();
    // It is locked until the first Genezio SDK is generated.
    sdkSynchronizer.acquire();

    if (!yamlProjectConfiguration.backend && !yamlProjectConfiguration.frontend) {
        throw new UserError(
            "No backend or frontend components found in the genezio.yaml file. You need at least one component to start the local environment.",
        );
    }
    if (
        !yamlProjectConfiguration.backend &&
        yamlProjectConfiguration.frontend &&
        yamlProjectConfiguration.frontend.every((f) => !f.scripts?.start)
    ) {
        throw new UserError(
            "No start script found for any frontend component. You need at least one start script to start the local environment.",
        );
    }

    await Promise.all([
        startBackendWatcher(yamlProjectConfiguration.backend, options, sdkSynchronizer),
        startFrontends(yamlProjectConfiguration.frontend, sdkSynchronizer),
    ]);
}

/**
 * Starts the frontends based on the provided configuration.
 *
 * @param frontendConfiguration - The configuration for the frontends.
 * @param sdkSynchronizer - The mutex used for synchronizing the SDK generation.
 * @returns Never returns, because it runs the frontends indefinitely.
 */
async function startFrontends(
    frontendConfiguration: YamlFrontend[] | undefined,
    sdkSynchronizer: Mutex,
) {
    if (!frontendConfiguration) return;

    // Start the frontends only after the first Genezio SDK was generated, until then wait.
    await sdkSynchronizer.waitForUnlock();

    await Promise.all(
        frontendConfiguration.map(async (frontend) => {
            await runFrontendStartScript(frontend.scripts?.start, frontend.path).catch(
                (e: UserError) =>
                    log.error(
                        new Error(
                            `Failed to start frontend located in \`${frontend.path}\`: ${e.message}`,
                        ),
                    ),
            );
        }),
    );
}

/**
 * Starts the backend watcher for local development.
 *
 * @param backendConfiguration - The backend configuration.
 * @param options - The Genezio local options.
 * @param sdkSynchronizer - The mutex for synchronizing SDK generation.
 * @returns Never returns, because it runs the local environment indefinitely.
 */
async function startBackendWatcher(
    backendConfiguration: YAMLBackend | undefined,
    options: GenezioLocalOptions,
    sdkSynchronizer: Mutex,
) {
    if (!backendConfiguration) {
        sdkSynchronizer.release();
        return;
    }

    // We need to check if the user is using an older version of @genezio/types
    // because we migrated the decorators implemented in the @genezio/types package to the stage 3 implementation.
    // Otherwise, the user will get an error at runtime. This check can be removed in the future once no one is using version
    // 0.1.* of @genezio/types.
    if (
        backendConfiguration.language.name === Language.ts ||
        backendConfiguration.language.name === Language.js
    ) {
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

        checkExperimentalDecorators(backendConfiguration.path);
    }

    await doAdaptiveLogAction("Running backend local scripts", async () => {
        await runScript(backendConfiguration.scripts?.local, backendConfiguration.path);
    }).catch(async (error) => {
        await GenezioTelemetry.sendEvent({
            eventType: TelemetryEventTypes.GENEZIO_PRE_START_LOCAL_SCRIPT_ERROR,
            commandOptions: JSON.stringify(options),
        });
        throw error;
    });

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
            yamlProjectConfiguration = await new YamlConfigurationIOController(
                options.config,
            ).read();
        } catch (error) {
            if (error instanceof Error) {
                log.error(error.message);
            }
            log.error(
                `Fix the errors and genezio local will restart automatically. Waiting for changes...`,
            );
            // If there was an error while parsing using babel the decorated class, wait for changes and try again.
            const { watcher } = await listenForChanges();
            if (watcher) {
                watcher.close();
            }
            logChangeDetection();
            continue;
        }

        const listenForChangesPromise: Promise<ClassProcessSpawnResponse> = listenForChanges();
        const classProcessSpawnPromise: Promise<ClassProcessSpawnResponse> =
            prepareLocalBackendEnvironment(yamlProjectConfiguration, options);

        let promiseRes: ClassProcessSpawnResponse = await Promise.race([
            classProcessSpawnPromise,
            listenForChangesPromise,
        ]);

        // If the listenForChanges promise is resolved first, it means that the user made a change in the code and we
        // need to rebundle and restart the backend.
        if (promiseRes.restartEnvironment === true) {
            // Wait for classes to be spawned before restarting the environment
            promiseRes = await classProcessSpawnPromise;

            if (!promiseRes.spawnOutput || promiseRes.spawnOutput.success === false) {
                continue;
            }

            // clean up the old processes
            promiseRes.spawnOutput.processForClasses.forEach((classProcess: ClassProcess) => {
                classProcess.process.kill();
            });

            if (promiseRes.watcher) {
                promiseRes.watcher.close();
            }
            logChangeDetection();
            continue;
        }

        if (!promiseRes.spawnOutput || promiseRes.spawnOutput.success === false) {
            continue;
        }

        const projectConfiguration: ProjectConfiguration =
            promiseRes.spawnOutput.projectConfiguration;
        const processForClasses: Map<string, ClassProcess> =
            promiseRes.spawnOutput.processForClasses;
        const sdk: SdkGeneratorResponse = promiseRes.spawnOutput.sdk;

        // Start HTTP Server
        const server = await startServerHttp(
            options.port,
            projectConfiguration.astSummary,
            yamlProjectConfiguration.name,
            processForClasses,
        );

        // Start cron jobs
        const crons = startCronJobs(projectConfiguration, processForClasses);
        log.info(
            "\x1b[36m%s\x1b[0m",
            "Your local server is running and the SDK was successfully generated!",
        );
        const watcherTimeout = await handleSdk(
            yamlProjectConfiguration.name,
            yamlProjectConfiguration.frontend,
            sdk,
            options,
        );
        reportSuccess(projectConfiguration, options.port);

        if (sdkSynchronizer.isLocked()) sdkSynchronizer.release();

        // This check makes sense only for js/ts backend, skip for dart, go etc.
        if (
            backendConfiguration.language.name === Language.ts ||
            backendConfiguration.language.name === Language.js
        ) {
            reportDifferentNodeRuntime(projectConfiguration.options?.nodeRuntime);
        }

        // Start listening for changes in user's code
        const { watcher } = await listenForChanges();
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
        clearTimeout(watcherTimeout);
    }
}

function logChangeDetection() {
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
            throw new UserError(`Unsupported language ${classInfo.language}.`);
        }

        const astClass = sdk.sdkGeneratorInput.classesInfo.find(
            (c) => c.classConfiguration.path === classInfo.path,
        );
        if (astClass === undefined) {
            throw new UserError("AST class not found.");
        }
        const ast = astClass.program;

        debugLogger.debug("Start bundling...");
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

    try {
        await importServiceEnvVariables(
            projectConfiguration.name,
            projectConfiguration.region,
            options.stage ? options.stage : "prod",
        );
    } catch (error) {
        if (error instanceof UserError) {
            throw error;
        }
    }

    const envVars: dotenv.DotenvPopulateInput = {};
    const envFile = projectConfiguration.workspace?.backend
        ? path.join(projectConfiguration.workspace.backend, ".env")
        : path.join(process.cwd(), ".env");
    dotenv.config({ path: options.env || envFile, processEnv: envVars });
    for (const bundlerOutput of bundlersOutput) {
        const extra = bundlerOutput.extra;

        if (!extra) {
            throw new UserError("Bundler output is missing extra field.");
        }

        if (!extra.startingCommand) {
            throw new UserError("No starting command found for this language.");
        }

        await startClassProcess(
            extra.startingCommand,
            extra.commandParameters ? extra.commandParameters : [],
            bundlerOutput.configuration.name,
            processForClasses,
            envVars,
            projectConfiguration.workspace?.backend,
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
            bundler = new LocalGoBundler();
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
    const require = createRequire(import.meta.url);
    app.use(cors());
    app.use(bodyParser.raw({ type: () => true, limit: "6mb" }));
    app.use(genezioRequestParser);
    const packagePath = path.dirname(require.resolve("@genezio/test-interface-component"));
    // serve test interface built folder on localhost
    const buildFolder = path.join(packagePath, "build");

    app.use(express.static(buildFolder));
    app.get(`/explore`, (_req, res) => {
        const filePath = path.join(buildFolder, "index.html");
        res.sendFile(filePath);
    });

    app.get("/get-ast-summary", (_req, res) => {
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
        const server = app.listen(port, "0.0.0.0", () => {
            log.info(`Server listening on port ${port}`);
            resolve(server);
        });

        server.on("error", (error) => {
            const err = error as NodeJS.ErrnoException;
            if (err.code === "EADDRINUSE") {
                reject(new UserError(PORT_ALREADY_USED(port)));
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
            cronHandler.cronObject.stop();
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

async function listenForChanges() {
    const cwd = process.cwd();

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

    return new Promise<ClassProcessSpawnResponse>((resolve) => {
        // Watch for changes in the classes and update the handlers
        const watchPaths = [path.join(cwd, "/**/*")];
        const ignoredPaths: string[] = ["**/node_modules/*", ...ignoredPathsFromGenezioIgnore];

        const watch = chokidar
            .watch(watchPaths, {
                // Disable fsevents for macos
                useFsEvents: false,
                ignored: ignoredPaths,
                ignoreInitial: true,
            })
            .on("all", async () => {
                resolve({
                    restartEnvironment: true,
                    watcher: watch,
                });
            });
    });
}

/**
 * Handles the SDK generation and the SDK writing, the SDK publishing to registries.
 * It also monitors the SDK for changes and updates the local SDKs.
 *
 * @param projectName The name of the project.
 * @param projectRegion The region of the project.
 * @param frontend The frontend configuration.
 * @param backendSdk The backend SDK configuration.
 * @param sdk The SDK response.
 * @param options The local options.
 *
 * @returns NodeJS.Timeout that can be used to stop the watchers.
 */
async function handleSdk(
    projectName: string,
    frontends: YamlFrontend[] | undefined,
    sdk: SdkGeneratorResponse,
    options: GenezioLocalOptions,
): Promise<NodeJS.Timeout | undefined> {
    let sdkLanguage: Language = Language.ts;
    let nodeJsWatcher: NodeJS.Timeout | undefined = undefined;
    let sdkPath, frontendPath: string | undefined;

    if (frontends && frontends.length > 0) {
        sdkLanguage = frontends[0].sdk?.language || Language.ts;
        frontendPath = frontends[0].path;
        if (frontendPath) {
            sdkPath = frontends[0].sdk?.path
                ? path.join(frontendPath, frontends[0].sdk?.path)
                : path.join(frontendPath, "sdk");
        }
    } else {
        const linkedPaths = await getLinkPathsForProject(projectName);
        if (linkedPaths.length > 0) {
            const linkedPath = linkedPaths[0];
            sdkPath = path.join(linkedPath, "sdk");
        }
    }

    const classUrls = sdk.files.map((c) => ({
        name: c.className,
        cloudUrl: `http://127.0.0.1:${options.port}/${c.className}`,
    }));

    const sdkFolderPath = await writeSdk({
        language: sdkLanguage,
        packageName: `@genezio-sdk/${projectName}`,
        packageVersion: undefined,
        sdkResponse: sdk,
        classUrls,
        publish: false,
        installPackage: true,
        outputPath: sdkPath,
    });

    if (sdkFolderPath) {
        const timeout = await watchPackage(sdkLanguage, projectName, frontends, sdkFolderPath);
        if (timeout) {
            nodeJsWatcher = timeout;
        }
    }

    reportSuccessForSdk(sdkLanguage, sdk, GenezioCommand.local, {
        name: projectName,
        stage: "local",
    });

    return nodeJsWatcher;
}

function reportSuccess(projectConfiguration: ProjectConfiguration, port: number) {
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

    _reportSuccess(classesInfo);

    log.info(colors.cyan(`Test your code at http://localhost:${port}/explore`));
}

// This method is used to check if the user has a different node version installed than the one used by the server.
// If the user has a different version, a warning message will be displayed.
function reportDifferentNodeRuntime(userDefinedNodeRuntime: string | undefined) {
    const installedNodeVersion = process.version;

    // get server used version
    let serverNodeRuntime: string = DEFAULT_NODE_RUNTIME as string;
    if (userDefinedNodeRuntime) {
        serverNodeRuntime = userDefinedNodeRuntime;
    }

    const nodeMajorVersion = installedNodeVersion.split(".")[0].slice(1);
    const serverMajorVersion = serverNodeRuntime.split(".")[0].split("nodejs")[1];

    // check if server version is different from installed version
    if (nodeMajorVersion !== serverMajorVersion) {
        log.warn(
            `${colors.yellow(`Warning: The installed node version ${installedNodeVersion} but your server is configured to use ${serverNodeRuntime}. This might cause unexpected behavior.
To change the server version, go to your ${colors.cyan(
                "genezio.yaml",
            )} file and change the ${colors.cyan(
                "backend.language.runtime",
            )} property to the version you want to use.`)}`,
        );
    }
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
    process.env["LOGGED_IN_LOCAL"] = "";
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
    cwd?: string,
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
        cwd,
    });
    classProcess.stdout.on("data", (data) => log.info(data.toString().trim()));
    classProcess.stderr.on("data", (data) => log.info(data.toString().trim()));

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
