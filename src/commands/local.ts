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
import {
    ProjectConfiguration,
    ClassConfiguration,
    FunctionConfiguration,
} from "../models/projectConfiguration.js";
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
import { createTemporaryFolder, fileExists, readUTF8File, writeToFile } from "../utils/file.js";
import {
    GenezioCommand,
    reportSuccess as _reportSuccess,
    reportSuccessFunctions,
} from "../utils/reporter.js";
import { SdkHandlerResponse } from "../models/sdkGeneratorResponse.js";
import { GenezioLocalOptions } from "../models/commandOptions.js";
import { DartBundler } from "../bundlers/dart/localDartBundler.js";
import axios, { AxiosError, AxiosResponse } from "axios";
import { findAvailablePort } from "../utils/findAvailablePort.js";
import {
    entryFileFunctionMap,
    FunctionType,
    Language,
    startingCommandMap,
    TriggerType,
} from "../projectConfiguration/yaml/models.js";
import {
    YAMLBackend,
    YamlConfigurationIOController,
    YamlFrontend,
    YamlProjectConfiguration,
} from "../projectConfiguration/yaml/v2.js";
import hash from "hash-it";
import { GenezioTelemetry, TelemetryEventTypes } from "../telemetry/telemetry.js";
import dotenv from "dotenv";
import { TsRequiredDepsBundler } from "../bundlers/node/typescriptRequiredDepsBundler.js";
import { DEFAULT_NODE_RUNTIME, NodeOptions, PythonOptions } from "../models/projectOptions.js";
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
import { Mutex } from "async-mutex";
import httpProxy from "http-proxy";
import * as readline from "readline";
import { getLinkedFrontendsForProject } from "../utils/linkDatabase.js";
import fsExtra from "fs-extra/esm";
import { DeployCodeFunctionResponse } from "../models/deployCodeResponse.js";
import {
    enableAuthentication,
    evaluateResource,
    getOrCreateDatabase,
    getOrCreateEmptyProject,
} from "./deploy/utils.js";
import { displayHint } from "../utils/strings.js";
import { enableEmailIntegration, getProjectIntegrations } from "../requests/integration.js";
import { expandEnvironmentVariables, findAnEnvFile } from "../utils/environmentVariables.js";
import { getFunctionHandlerProvider } from "../utils/getFunctionHandlerProvider.js";
import { getFunctionEntryFilename } from "../utils/getFunctionEntryFilename.js";
import { detectPythonCommand } from "../utils/detectPythonCommand.js";

type UnitProcess = {
    process: ChildProcess;
    startingCommand: string;
    parameters: string[];
    listeningPort: number;
    envVars: dotenv.DotenvPopulateInput;
    type: "class" | "function";
    handlerType?: FunctionType;
};

type LocalUnitProcessSpawnResponse = {
    restartEnvironment: boolean;
    spawnOutput?: LocalProcessSpawnOutput;
    watcher?: chokidar.FSWatcher;
};

type LocalProcessSpawnOutput = {
    success: boolean;
    projectConfiguration: ProjectConfiguration;
    processForLocalUnits: Map<string, UnitProcess>;
    sdk: SdkHandlerResponse;
};

export async function prepareLocalBackendEnvironment(
    yamlProjectConfiguration: YamlProjectConfiguration,
    options: GenezioLocalOptions,
): Promise<LocalUnitProcessSpawnResponse> {
    try {
        const databases = yamlProjectConfiguration.services?.databases;
        const authentication = yamlProjectConfiguration.services?.authentication;
        const email = yamlProjectConfiguration.services?.email;
        const backend = yamlProjectConfiguration.backend;
        const frontend = yamlProjectConfiguration.frontend;

        const projectName = yamlProjectConfiguration.name;
        const region = yamlProjectConfiguration.region;

        let configurationEnvVars: { [key: string]: string | undefined } = {};
        if (yamlProjectConfiguration.services) {
            const projectDetails = await getOrCreateEmptyProject(
                projectName,
                region,
                options.stage || "prod",
                /* ask */ true,
            );

            if (databases && projectDetails) {
                // Get connection URL and expose it as an environment variable only for the server process
                for (const database of databases) {
                    if (!database.region) {
                        database.region = region;
                    }
                    const remoteDatabase = await getOrCreateDatabase(
                        {
                            name: database.name,
                            region: database.region,
                            type: database.type,
                        },
                        options.stage || "prod",
                        projectDetails.projectId,
                        projectDetails.projectEnvId,
                        /* ask */ true,
                    );

                    if (!remoteDatabase) {
                        break;
                    }

                    const databaseConnectionUrlKey = `${remoteDatabase.name.replace(/-/g, "_").toUpperCase()}_DATABASE_URL`;
                    configurationEnvVars = {
                        ...configurationEnvVars,
                        [databaseConnectionUrlKey]: remoteDatabase.connectionUrl,
                    };

                    log.info(
                        displayHint(
                            `You can use \`process.env["${databaseConnectionUrlKey}"]\` to connect to the remote database \`${remoteDatabase.name}\`.`,
                        ),
                    );
                }
            }

            if (authentication && projectDetails) {
                const envFile = options.env || (await findAnEnvFile(process.cwd()));
                await enableAuthentication(
                    yamlProjectConfiguration,
                    projectDetails.projectId,
                    projectDetails.projectEnvId,
                    options.stage || "prod",
                    envFile,
                    /* ask */ true,
                );

                log.info(
                    displayHint(
                        `You can reference authentication token and region using \${{services.authentication.token}} and \${{services.authentication.region}}.`,
                    ),
                );
            }

            if (email && projectDetails) {
                const isEnabled = (
                    await getProjectIntegrations(
                        projectDetails.projectId,
                        projectDetails.projectEnvId,
                    )
                ).integrations.find((integration) => integration === "EMAIL-SERVICE");

                if (!isEnabled) {
                    await enableEmailIntegration(
                        projectDetails.projectId,
                        projectDetails.projectEnvId,
                    );
                    log.info("Email integration enabled successfully.");
                }
                log.info(
                    displayHint(`You can use \`process.env[EMAIL_SERVICE_TOKEN]\` to send emails.`),
                );
            }
        }

        if (!backend) {
            throw new UserError("No backend component found in the genezio.yaml file.");
        }
        backend.classes = await scanClassesForDecorators(backend);
        backend.functions = backend.functions ?? [];

        if (backend.classes.length === 0 && backend.functions?.length === 0) {
            throw new UserError(GENEZIO_NO_CLASSES_FOUND(backend.language.name));
        }

        const sdkLanguages: Language[] = [];
        // Add configuration frontends that contain the SDK field
        sdkLanguages.push(
            ...((frontend || [])
                .map((f) => f.sdk?.language)
                .filter((f) => f !== undefined) as Language[]),
        );
        // Add linked frontends
        sdkLanguages.push(
            ...(await getLinkedFrontendsForProject(yamlProjectConfiguration.name)).map(
                (f) => f.language,
            ),
        );

        const sdkResponse = await sdkGeneratorApiHandler(
            sdkLanguages,
            mapYamlClassToSdkClassConfiguration(
                backend.classes,
                backend.language.name,
                backend.path,
            ),
            backend.path,
            /* packageName= */ `@genezio-sdk/${yamlProjectConfiguration.name}`,
        ).catch((error) => {
            if (error.code === "ENOENT") {
                log.error(
                    `The file ${error.path} does not exist. Please check your genezio.yaml configuration and make sure that all the file paths are correct.`,
                );
            }

            throw error;
        });
        const projectConfiguration = new ProjectConfiguration(
            yamlProjectConfiguration,
            CloudProviderIdentifier.GENEZIO_AWS,
            sdkResponse,
        );

        const processForLocalUnits = await startProcesses(
            backend,
            projectConfiguration,
            sdkResponse,
            options,
            configurationEnvVars,
        );
        return await new Promise<LocalUnitProcessSpawnResponse>((resolve) => {
            resolve({
                restartEnvironment: false,
                spawnOutput: {
                    success: true,
                    projectConfiguration,
                    processForLocalUnits,
                    sdk: sdkResponse,
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
        return new Promise<LocalUnitProcessSpawnResponse>((resolve) => {
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
        startFrontends(
            yamlProjectConfiguration.frontend,
            sdkSynchronizer,
            yamlProjectConfiguration,
            options.stage || "prod",
            options.port,
        ),
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
    configuration: YamlProjectConfiguration,
    stage: string,
    port?: number,
) {
    if (!frontendConfiguration) return;

    // Start the frontends only after the first Genezio SDK was generated, until then wait.
    await sdkSynchronizer.waitForUnlock();

    await Promise.all(
        frontendConfiguration.map(async (frontend) => {
            const newEnvObject = await expandEnvironmentVariables(
                frontend.environment,
                configuration,
                stage,
                /* envFile */ undefined,
                {
                    isLocal: true,
                    port: port,
                },
            );

            debugLogger.debug(
                `Environment variables injected for frontend.scripts.local:`,
                JSON.stringify(newEnvObject),
            );

            await runFrontendStartScript(
                frontend.scripts?.start,
                frontend.path,
                newEnvObject,
            ).catch((e: UserError) =>
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

        const listenForChangesPromise: Promise<LocalUnitProcessSpawnResponse> = listenForChanges();
        const localUnitProcessSpawnPromise: Promise<LocalUnitProcessSpawnResponse> =
            prepareLocalBackendEnvironment(yamlProjectConfiguration, options);

        let promiseRes: LocalUnitProcessSpawnResponse = await Promise.race([
            localUnitProcessSpawnPromise,
            listenForChangesPromise,
        ]);

        // If the listenForChanges promise is resolved first, it means that the user made a change in the code and we
        // need to rebundle and restart the backend.
        if (promiseRes.restartEnvironment === true) {
            // Wait for classes to be spawned before restarting the environment
            promiseRes = await localUnitProcessSpawnPromise;

            if (!promiseRes.spawnOutput || promiseRes.spawnOutput.success === false) {
                continue;
            }

            // clean up the old processes
            promiseRes.spawnOutput.processForLocalUnits.forEach((unitProcess: UnitProcess) => {
                unitProcess.process.kill();
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
        const processForUnits: Map<string, UnitProcess> =
            promiseRes.spawnOutput.processForLocalUnits;
        const sdk: SdkHandlerResponse = promiseRes.spawnOutput.sdk;

        // Start HTTP Server
        const server = await startServerHttp(
            options.port,
            yamlProjectConfiguration.name,
            processForUnits,
            projectConfiguration,
        );

        // Start cron jobs
        const crons = await startCronJobs(
            projectConfiguration,
            processForUnits,
            yamlProjectConfiguration,
            options.port,
        );
        log.info(
            "\x1b[36m%s\x1b[0m",
            "Your local server is running and the SDK was successfully generated!",
        );
        const watcherTimeouts = await handleSdk(
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
            const isNodeOptions = (
                options: NodeOptions | PythonOptions | undefined,
            ): options is NodeOptions => {
                return (options as NodeOptions).nodeRuntime !== undefined;
            };
            if (!isNodeOptions(projectConfiguration.options)) {
                throw new UserError("Invalid node options");
            }

            reportDifferentNodeRuntime(projectConfiguration.options?.nodeRuntime);
        }

        // Start listening for changes in user's code
        const { watcher } = await listenForChanges();
        if (watcher) {
            watcher.close();
        }
        logChangeDetection();

        // When new changes are detected, close everything and restart the process
        clearAllResources(server, processForUnits, crons);
        await GenezioTelemetry.sendEvent({
            eventType: TelemetryEventTypes.GENEZIO_LOCAL_RELOAD,
            commandOptions: JSON.stringify(options),
        });
        watcherTimeouts.forEach((timeout) => clearTimeout(timeout));
    }
}

function logChangeDetection() {
    log.info("\x1b[36m%s\x1b[0m", "Change detected, reloading...");
}

/**
 * Bundle each class and start a new process for it.
 */
async function startProcesses(
    backend: YAMLBackend,
    projectConfiguration: ProjectConfiguration,
    sdk: SdkHandlerResponse,
    options: GenezioLocalOptions,
    configurationEnvVars?: { [key: string]: string | undefined },
): Promise<Map<string, UnitProcess>> {
    const classes = projectConfiguration.classes;
    const processForLocalUnits = new Map<string, UnitProcess>();

    // Bundle each class and start a new process for it
    const bundlersOutputPromiseClasses = classes.map(async (classInfo) => {
        const bundler = getBundler(classInfo);

        if (!bundler) {
            throw new UserError(`Unsupported language ${classInfo.language}.`);
        }

        const astClass = sdk.classesInfo.find((c) => c.classConfiguration.path === classInfo.path);
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
        return { ...bundlerOutput, type: "class" };
    });

    const bundlersOutputPromiseFunctions = projectConfiguration.functions?.map(
        async (functionInfo: FunctionConfiguration) => {
            const tmpFolder = await createTemporaryFolder(
                `${functionInfo.name}-${hash(functionInfo.path)}`,
            );
            // delete all content in the tmp folder
            await fsExtra.emptyDir(tmpFolder);

            await fsExtra.copy(path.join(backend.path, functionInfo.path), tmpFolder);

            const handlerProvider = getFunctionHandlerProvider(
                functionInfo.type,
                functionInfo.language as Language,
            );

            // if handlerProvider is Http, run it with node
            if (
                functionInfo.type === FunctionType.httpServer &&
                (functionInfo.language === Language.js || functionInfo.language === Language.ts)
            ) {
                return {
                    configuration: functionInfo,
                    extra: {
                        type: "function" as const,
                        startingCommand: "node",
                        commandParameters: [functionInfo.entry],
                        handlerType: FunctionType.httpServer,
                    },
                };
            }

            // if handlerProvider is Http and language is python
            if (
                functionInfo.type === FunctionType.httpServer &&
                functionInfo.language === Language.python
            ) {
                return {
                    configuration: functionInfo,
                    extra: {
                        type: "function" as const,
                        startingCommand: (await detectPythonCommand()) || "python",
                        commandParameters: [functionInfo.entry],
                        handlerType: FunctionType.httpServer,
                    },
                };
            }

            await writeToFile(
                path.join(tmpFolder),
                getFunctionEntryFilename(
                    functionInfo.language as Language,
                    "local_function_wrapper",
                ),
                await handlerProvider!.getLocalFunctionWrapperCode(
                    functionInfo.handler,
                    functionInfo.entry,
                ),
            );

            return {
                configuration: functionInfo,
                extra: {
                    type: "function" as const,
                    startingCommand:
                        startingCommandMap[
                            functionInfo.language as keyof typeof startingCommandMap
                        ],
                    commandParameters: [
                        path.resolve(
                            tmpFolder,
                            `local_function_wrapper.${entryFileFunctionMap[functionInfo.language as keyof typeof entryFileFunctionMap].split(".")[1]}`,
                        ),
                    ],
                },
            };
        },
    );

    const bundlersOutput = await Promise.all([
        ...bundlersOutputPromiseClasses,
        ...bundlersOutputPromiseFunctions,
    ]);

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

        await startLocalUnitProcess(
            extra.startingCommand,
            extra.commandParameters ? extra.commandParameters : [],
            bundlerOutput.configuration.name,
            processForLocalUnits,
            envVars,
            extra.type || "class",
            projectConfiguration.workspace?.backend,
            configurationEnvVars,
        );
    }

    return processForLocalUnits;
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
    projectName: string,
    processForUnits: Map<string, UnitProcess>,
    projectConfiguration: ProjectConfiguration,
): Promise<http.Server> {
    const astSummary: AstSummary = projectConfiguration.astSummary;
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

    app.get("/get-functions", (_req, res) => {
        res.setHeader("Content-Type", "application/json");
        res.end(
            JSON.stringify({
                functions: getProjectFunctions(port, projectConfiguration),
                name: projectName,
            }),
        );
    });

    app.all(`/:className`, async (req, res) => {
        const reqToFunction = getEventObjectFromRequest(req);

        const localProcess = processForUnits.get(req.params.className);

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
                cookies: [],
            });
            return;
        }

        try {
            const response = await communicateWithProcess(
                localProcess,
                req.params.className,
                reqToFunction,
                processForUnits,
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
                cookies: [],
            });
            return;
        }
    });

    async function handlerFunctionCall(req: Request<{ functionName: string }>, res: Response) {
        const reqToFunction = getEventObjectFromRequest(req);
        // remove /.functions/:functionName from the url in order to get expected path for the function
        reqToFunction.rawPath = "/" + reqToFunction.rawPath?.split("/").slice(3).join("/");
        reqToFunction.requestContext.http.path = reqToFunction.rawPath;

        const localProcess = processForUnits.get(req.params.functionName);

        if (!localProcess) {
            sendResponse(res, {
                body: "Function not found!",
                isBase64Encoded: false,
                statusCode: "500",
                statusDescription: "500 Internal Server Error",
                headers: {
                    "content-type": "application/json",
                },
                cookies: [],
            });
            return;
        }

        try {
            const response = await communicateWithProcess(
                localProcess,
                req.params.functionName,
                reqToFunction,
                processForUnits,
            );
            sendResponse(res, response.data);
        } catch (error) {
            sendResponse(res, {
                body: JSON.stringify({ message: "Internal server error", error: error }),
                isBase64Encoded: false,
                statusCode: "500",
                statusDescription: "500 Internal Server Error",
                headers: {
                    "content-type": "application/json",
                },
                cookies: [],
            });
            return;
        }
    }

    app.all(`/.functions/:functionName/*`, async (req, res) => {
        await handlerFunctionCall(req, res);
    });

    app.all(`/.functions/:functionName`, async (req, res) => {
        await handlerFunctionCall(req, res);
    });

    async function handlerHttpMethod(
        req: Request<{ className: string; methodName: string }>,
        res: Response,
    ) {
        const reqToFunction = getEventObjectFromRequest(req);

        const localProcess = processForUnits.get(req.params.className);

        if (!localProcess) {
            res.status(404).send(`Class ${req.params.className} not found.`);
            return;
        }

        try {
            const response = await communicateWithProcess(
                localProcess,
                req.params.className,
                reqToFunction,
                processForUnits,
            );
            sendResponse(res, response.data);
        } catch (error) {
            sendResponse(res, {
                body: JSON.stringify({
                    error: { code: -32000, message: "Internal error" },
                }),
                isBase64Encoded: false,
                statusCode: "500",
                statusDescription: "Internal Server Error",
                headers: {
                    "content-type": "application/json",
                },
                cookies: [],
            });
            return;
        }
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

        // this is needed to handle the websocket connections
        server.on("upgrade", (req, socket, head) => {
            if (req.url === undefined) {
                return;
            }

            const parsedURL = url.parse(req.url, true);

            const localProcess = processForUnits.get(parsedURL.query["class"] as string);
            const proxy = httpProxy.createProxyServer({
                target: {
                    host: "127.0.0.1",
                    port: localProcess?.listeningPort || 8080,
                },
                ws: true,
            });

            try {
                proxy.ws(req, socket, head);
            } catch (error) {
                throw new UserError("Error while upgrading the connection to websocket.");
            }
        });
    });
}

function getProjectFunctions(
    port: number,
    projectConfiguration: ProjectConfiguration,
): DeployCodeFunctionResponse[] {
    return projectConfiguration.functions.map((f) => ({
        cloudUrl: retrieveLocalFunctionUrl(f),
        id: f.name,
        name: f.name,
    }));
}

export type LocalEnvCronHandler = {
    cronString: string;
    cronObject: cron.ScheduledTask | null;
};

async function startCronJobs(
    projectConfiguration: ProjectConfiguration,
    processForUnits: Map<string, UnitProcess>,
    yamlProjectConfiguration: YamlProjectConfiguration,
    port?: number,
): Promise<LocalEnvCronHandler[]> {
    const cronHandlers: LocalEnvCronHandler[] = [];
    for (const classElement of projectConfiguration.classes) {
        const methods = classElement.methods;
        for (const method of methods) {
            if (method.type === TriggerType.cron && method.cronString) {
                const cronHandler: LocalEnvCronHandler = {
                    cronString: rectifyCronString(method.cronString),
                    cronObject: null,
                };

                const process = processForUnits.get(classElement.name)!;

                cronHandler.cronObject = cron.schedule(cronHandler.cronString, () => {
                    const reqToFunction = {
                        genezioEventType: "cron",
                        methodName: method.name,
                        cronString: cronHandler.cronString,
                    };

                    void communicateWithProcess(
                        process,
                        classElement.name,
                        reqToFunction,
                        processForUnits,
                    );
                });

                cronHandler.cronObject.start();
                cronHandlers.push(cronHandler);
            }
        }
    }

    if (yamlProjectConfiguration.services && yamlProjectConfiguration.services.crons) {
        for (const cronService of yamlProjectConfiguration.services.crons) {
            const functionName = await evaluateResource(
                yamlProjectConfiguration,
                cronService.function,
                undefined,
                undefined,
                {
                    isLocal: true,
                    port: port,
                },
            );
            const endpoint = cronService.endpoint?.replace(/^\//, "");
            const cronString = cronService.schedule;
            const functionConfiguration = projectConfiguration.functions.find(
                (f) => f.name === `function-${functionName}`,
            );
            if (!functionConfiguration) {
                throw new UserError(
                    `Function ${functionName} not found in deployed functions. Check if your function is deployed. If the problem persists, please contact support at contact@genez.io.`,
                );
            }
            const baseURL = retrieveLocalFunctionUrl(functionConfiguration);
            let url: string;
            if (endpoint) {
                url = `${baseURL}/${endpoint}`;
            } else {
                url = baseURL;
            }

            const cronHandler: LocalEnvCronHandler = {
                cronString: rectifyCronString(cronString),
                cronObject: null,
            };

            cronHandler.cronObject = cron.schedule(cronHandler.cronString, async () => {
                log.info(
                    "DEBUG: trigger cron: " +
                        cronHandler.cronString +
                        " on function " +
                        functionName,
                );
                await axios.post(url);
            });

            cronHandler.cronObject.start();

            cronHandlers.push(cronHandler);
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

    const date = new Date();

    return {
        version: "2.0",
        routeKey: "$default",
        rawPath: urlDetails.pathname,
        headers: request.headers,
        rawQueryString: urlDetails.search ? urlDetails.search?.slice(1) : "",
        queryStringParameters: urlDetails.search ? Object.assign({}, urlDetails.query) : undefined,
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
            accountId: "anonymous",
            apiId: "localhost",
            domainName: "localhost",
            domainPrefix: "localhost",
            requestId: "undefined",
            routeKey: "$default",
            stage: "$default",
            time: formatTimestamp(date),
            timeEpoch: Date.now(),
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

    if (httpResponse.cookies) {
        for (const cookie of httpResponse.cookies) {
            res.setHeader("Set-Cookie", cookie);
        }
    }

    if (httpResponse.statusCode) {
        res.writeHead(parseInt(httpResponse.statusCode));
    }

    if (httpResponse.isBase64Encoded === true) {
        res.end(Buffer.from(httpResponse.body, "base64"));
    } else {
        if (Buffer.isBuffer(httpResponse.body)) {
            res.end(JSON.stringify(httpResponse.body.toJSON()));
        } else if (typeof httpResponse.body === "object") {
            res.end(JSON.stringify(httpResponse.body));
        } else {
            res.end(httpResponse.body ? httpResponse.body.toString() : "");
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

    return new Promise<LocalUnitProcessSpawnResponse>((resolve) => {
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
    sdk: SdkHandlerResponse,
    options: GenezioLocalOptions,
): Promise<Array<NodeJS.Timeout>> {
    const nodeJsWatchers: Array<NodeJS.Timeout> = [];

    const sdkLocations: Array<{ path: string; language: Language }> = [];

    for (const frontend of frontends || []) {
        if (frontend.sdk) {
            sdkLocations.push({
                path: path.join(frontend.path, frontend.sdk.path || "sdk"),
                language: frontend.sdk.language,
            });
        }
    }

    const linkedFrontends = await getLinkedFrontendsForProject(projectName);
    linkedFrontends.forEach((f) =>
        sdkLocations.push({
            path: f.path,
            language: f.language,
        }),
    );

    for (const sdkLocation of sdkLocations) {
        const sdkResponse = sdk.generatorResponses.find(
            (response) => response.sdkGeneratorInput.language === sdkLocation.language,
        );

        if (!sdkResponse) {
            throw new UserError("Could not find the SDK for the frontend.");
        }

        const workspaceUrl = getWorkspaceUrl(options.port);
        const classUrls = sdkResponse.files.map((c) => ({
            name: c.className,
            cloudUrl: workspaceUrl
                ? `${workspaceUrl}/${c.className}`
                : `http://127.0.0.1:${options.port}/${c.className}`,
        }));

        const sdkFolderPath = await writeSdk({
            language: sdkLocation.language,
            packageName: `@genezio-sdk/${projectName}`,
            packageVersion: undefined,
            sdkResponse,
            classUrls,
            publish: false,
            installPackage: true,
            outputPath: sdkLocation.path,
        });
        debugLogger.debug(
            `SDK for ${sdkLocation.language} written in ${sdkLocation.path}. ${sdkFolderPath}`,
        );

        if (sdkFolderPath) {
            const timeout = await watchPackage(
                sdkLocation.language,
                projectName,
                frontends?.filter(
                    (f) => f.sdk?.language === Language.ts || f.sdk?.language === Language.js,
                ),
                sdkFolderPath,
            );
            if (timeout) {
                nodeJsWatchers.push(timeout);
            }
        }

        reportSuccessForSdk(sdkLocation.language, sdkResponse, GenezioCommand.local, {
            name: projectName,
            stage: "local",
        });
    }

    return nodeJsWatchers;
}

function getWorkspaceUrl(port: number): string | undefined {
    let workspaceUrl: string | undefined;
    if (process.env?.["GITPOD_WORKSPACE_URL"]) {
        const gitPodWorkspaceUrl = process.env["GITPOD_WORKSPACE_URL"];
        workspaceUrl = gitPodWorkspaceUrl.replace("https://", `https://${port}-`);
    }
    if (
        process.env?.["CODESPACE_NAME"] &&
        process.env?.["GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN"]
    ) {
        const codespaceName = process.env["CODESPACE_NAME"];
        const portForwardingDomain = process.env["GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN"];
        workspaceUrl = `https://${codespaceName}-${port}.${portForwardingDomain}`;
    }
    return workspaceUrl;
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

    if (projectConfiguration.functions?.length > 0) {
        reportSuccessFunctions(
            projectConfiguration.functions.map((f) => ({
                name: f.name,
                id: f.name,
                cloudUrl: retrieveLocalFunctionUrl(f),
            })),
        );
    }

    const workspaceUrl = getWorkspaceUrl(port);
    log.info(
        colors.cyan(
            `Test your code at ${workspaceUrl ? workspaceUrl : `http://localhost:${port}`}/explore`,
        ),
    );
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
    processForUnits: Map<string, UnitProcess>,
    crons: LocalEnvCronHandler[],
) {
    process.env["LOGGED_IN_LOCAL"] = "";
    // await for server.close();
    await new Promise((resolve) => {
        server.close(() => {
            resolve(true);
        });
    });
    await stopCronJobs(crons);

    processForUnits.forEach((unitProcess) => {
        unitProcess.process.kill();
    });
}

async function startLocalUnitProcess(
    startingCommand: string,
    parameters: string[],
    localUnitName: string,
    processForUnits: Map<string, UnitProcess>,
    envVars: dotenv.DotenvPopulateInput = {},
    type: "class" | "function",
    cwd?: string,
    configurationEnvVars?: { [key: string]: string | undefined },
) {
    const availablePort = await findAvailablePort();
    debugLogger.debug(`[START_Unit_PROCESS] Starting ${localUnitName} on port ${availablePort}`);
    debugLogger.debug(`[START_Unit_PROCESS] Starting command: ${startingCommand}`);
    debugLogger.debug(`[START_Unit_PROCESS] Parameters: ${parameters}`);
    const processParameters = [...parameters, availablePort.toString()];
    const localUnitProcess = spawn(startingCommand, processParameters, {
        stdio: ["pipe", "pipe", "pipe"],
        env: {
            ...process.env,
            ...envVars,
            ...configurationEnvVars,
            NODE_OPTIONS: "--enable-source-maps",
        },
        cwd,
    });

    const localUnitStdoutLineStream = readline.createInterface({
        input: localUnitProcess.stdout,
    });
    const localUnitStderrLineStream = readline.createInterface({
        input: localUnitProcess.stderr,
    });

    localUnitStdoutLineStream.on("line", (line) => log.info(line));
    localUnitStderrLineStream.on("line", (line) => log.info(line));

    processForUnits.set(localUnitName, {
        type: type,
        process: localUnitProcess,
        listeningPort: availablePort,
        startingCommand: startingCommand,
        parameters: parameters,
        envVars: envVars,
    });
}

async function communicateWithProcess(
    localProcess: UnitProcess,
    unitName: string,
    data: Record<string, unknown>,
    processForUnits: Map<string, UnitProcess>,
): Promise<AxiosResponse> {
    try {
        return await axios.post(`http://127.0.0.1:${localProcess?.listeningPort}`, data);
    } catch (error) {
        if (
            error instanceof AxiosError &&
            (error.code === "ECONNRESET" || error.code === "ECONNREFUSED")
        ) {
            await startLocalUnitProcess(
                localProcess.startingCommand,
                localProcess.parameters,
                unitName,
                processForUnits,
                localProcess.envVars,
                localProcess.type,
            );
            log.error(`There was an error connecting to the server. Restarted ${unitName}.`);
        }
        throw error;
    }
}

function formatTimestamp(date: Date) {
    const day = String(date.getUTCDate()).padStart(2, "0");
    const monthNames = [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
    ];
    const month = monthNames[date.getUTCMonth()];
    const year = date.getUTCFullYear();

    const hours = String(date.getUTCHours()).padStart(2, "0");
    const minutes = String(date.getUTCMinutes()).padStart(2, "0");
    const seconds = String(date.getUTCSeconds()).padStart(2, "0");

    const formattedDate = `${day}/${month}/${year}:${hours}:${minutes}:${seconds} +0000`;
    return formattedDate;
}

export function retrieveLocalFunctionUrl(functionObj: FunctionConfiguration): string {
    if (functionObj.type === FunctionType.httpServer) {
        return `http://localhost:${functionObj.port ?? 8080}`;
    }

    return `http://localhost:${functionObj.port ?? 8080}/.functions/${functionObj.name}`;
}
