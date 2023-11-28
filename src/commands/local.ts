import log from "loglevel";
import { NodeJsBundler } from "../bundlers/node/nodeJsBundler.js";
import { KotlinBundler } from "../bundlers/kotlin/localKotlinBundler.js";
import express from "express";
import chokidar from "chokidar";
import cors from "cors";
import bodyParser from "body-parser";
import { ChildProcess, spawn } from "child_process";
import path from "path";
import url from "url";
import * as http from "http";
import colors from "colors";
import { ProjectConfiguration, ClassConfiguration } from "../models/projectConfiguration.js";
import { LOCAL_TEST_INTERFACE_URL } from "../constants.js";
import { GENEZIO_NO_CLASSES_FOUND, PORT_ALREADY_USED } from "../errors.js";
import { sdkGeneratorApiHandler } from "../generateSdk/generateSdkApi.js";
import { AstSummary } from "../models/astSummary.js";
import { getProjectConfiguration } from "../utils/configuration.js";
import { BundlerInterface } from "../bundlers/bundler.interface.js";
import { NodeJsLocalBundler } from "../bundlers/node/nodeJsLocalBundler.js";
import { BundlerComposer } from "../bundlers/bundlerComposer.js";
import { genezioRequestParser } from "../utils/genezioRequestParser.js";
import { debugLogger } from "../utils/logging.js";
import { rectifyCronString } from "../utils/rectifyCronString.js";
import cron from "node-cron";
import {
    createLocalTempFolder,
    createTemporaryFolder,
    fileExists,
    readUTF8File,
} from "../utils/file.js";
import { replaceUrlsInSdk, writeSdkToDisk } from "../utils/sdk.js";
import { GenezioCommand, reportSuccess as _reportSuccess } from "../utils/reporter.js";
import { SdkGeneratorResponse } from "../models/sdkGeneratorResponse.js";
import { GenezioLocalOptions } from "../models/commandOptions.js";
import { DartBundler } from "../bundlers/dart/localDartBundler.js";
import axios, { AxiosResponse } from "axios";
import { findAvailablePort } from "../utils/findAvailablePort.js";
import {
    Language,
    PackageManagerType,
    YamlProjectConfiguration,
    YamlProjectConfigurationType,
    YamlSdkConfiguration,
} from "../models/yamlProjectConfiguration.js";
import hash from "hash-it";
import { GenezioTelemetry, TelemetryEventTypes } from "../telemetry/telemetry.js";
import dotenv from "dotenv";
import { TsRequiredDepsBundler } from "../bundlers/node/typescriptRequiredDepsBundler.js";
import inquirer, { Answers } from "inquirer";
import { EOL } from "os";
import { DEFAULT_NODE_RUNTIME } from "../models/nodeRuntime.js";
import { getNodeModulePackageJsonLocal } from "../generateSdk/templates/packageJson.js";
import { compileSdk } from "../generateSdk/utils/compileSdk.js";
import { runNewProcess } from "../utils/process.js";
import { exit } from "process";

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

export async function prepareLocalEnvironment(
    yamlProjectConfiguration: YamlProjectConfiguration,
    options: GenezioLocalOptions,
): Promise<BundlerRestartResponse> {
    // eslint-disable-next-line no-async-promise-executor
    return new Promise<BundlerRestartResponse>(async (resolve) => {
        try {
            if (yamlProjectConfiguration.classes!.length === 0) {
                throw new Error(GENEZIO_NO_CLASSES_FOUND);
            }

            const sdk = await sdkGeneratorApiHandler(yamlProjectConfiguration).catch((error) => {
                debugLogger.log("An error occurred", error);
                if (error.code === "ENOENT") {
                    log.error(
                        `The file ${error.path} does not exist. Please check your genezio.yaml configuration and make sure that all the file paths are correct.`,
                    );
                    throw error;
                }

                // TODO: this is not very generic error handling. The SDK should throw Genezio errors, not babel.
                if (error.code === "BABEL_PARSER_SYNTAX_ERROR") {
                    log.error("Syntax error:");
                    log.error(`Reason Code: ${error.reasonCode}`);
                    log.error(`File: ${error.path}:${error.loc.line}:${error.loc.column}`);

                    throw error;
                }

                throw error;
            });

            const projectConfiguration = new ProjectConfiguration(yamlProjectConfiguration, sdk);

            const processForClasses = await startProcesses(projectConfiguration, sdk, options);
            resolve({
                shouldRestartBundling: false,
                bundlerOutput: {
                    success: true,
                    projectConfiguration,
                    processForClasses,
                    sdk,
                },
            });
        } catch (error: any) {
            log.error(error.message);
            log.error(
                `Fix the errors and genezio local will restart automatically. Waiting for changes...`,
            );
            // If there was an error generating the SDK, wait for changes and try again.
            const { watcher } = await listenForChanges(undefined);
            logChangeDetection();
            resolve({
                shouldRestartBundling: true,
                bundlerOutput: undefined,
                watcher,
            });
        }
    });
}

// Function that starts the local environment.
// It also monitors for changes in the user's code and restarts the environment when changes are detected.
export async function startLocalEnvironment(options: GenezioLocalOptions) {
    GenezioTelemetry.sendEvent({
        eventType: TelemetryEventTypes.GENEZIO_LOCAL,
        commandOptions: JSON.stringify(options),
    });
    const yamlProjectConfiguration = await getProjectConfiguration();

    if (yamlProjectConfiguration.scripts?.preStartLocal) {
        log.info("Running preStartLocal script...");
        log.info(yamlProjectConfiguration.scripts.preStartLocal);
        const success = await runNewProcess(yamlProjectConfiguration.scripts.preStartLocal);
        if (!success) {
            GenezioTelemetry.sendEvent({
                eventType: TelemetryEventTypes.GENEZIO_PRE_START_LOCAL_SCRIPT_ERROR,
                commandOptions: JSON.stringify(options),
            });
            log.error("preStartLocal script failed.");
            exit(1);
        }
    }

    // eslint-disable-next-line no-constant-condition
    while (true) {
        // Read the project configuration every time because it might change
        let yamlProjectConfiguration;
        try {
            yamlProjectConfiguration = await getProjectConfiguration();
        } catch (error: any) {
            log.error(error.message);
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
        if (!Language[yamlProjectConfiguration.language as keyof typeof Language]) {
            log.info(
                "This sdk.language is not supported by default. It will be treated as a custom language.",
            );
        }

        if (yamlProjectConfiguration.scripts?.preReloadLocal) {
            log.info("Running preReloadLocal script...");
            log.info(yamlProjectConfiguration.scripts.preReloadLocal);
            const success = await runNewProcess(yamlProjectConfiguration.scripts.preReloadLocal);
            if (!success) {
                GenezioTelemetry.sendEvent({
                    eventType: TelemetryEventTypes.GENEZIO_PRE_RELOAD_LOCAL_SCRIPT_ERROR,
                    commandOptions: JSON.stringify(options),
                });
                log.error("preReloadLocal script failed.");
                exit(1);
            }
        }

        if (!yamlProjectConfiguration.packageManager && !yamlProjectConfiguration.sdk) {
            const optionalPackageManager: Answers = await inquirer.prompt([
                {
                    type: "list",
                    name: "packageManager",
                    message:
                        "Which package manager are you using to install your frontend dependencies?",
                    choices: Object.keys(PackageManagerType).filter((key) => isNaN(Number(key))),
                },
            ]);
            yamlProjectConfiguration.packageManager = optionalPackageManager.packageManager;
            await yamlProjectConfiguration.writeToFile();
        }

        let sdkConfiguration = yamlProjectConfiguration.sdk;
        if (!yamlProjectConfiguration.sdk) {
            const sdkPath = await createLocalTempFolder(
                `${yamlProjectConfiguration.name}-${yamlProjectConfiguration.region}`,
            );

            sdkConfiguration = new YamlSdkConfiguration(
                Language[yamlProjectConfiguration.language as keyof typeof Language],
                path.join(sdkPath, "sdk"),
            );
        }

        let sdk: SdkGeneratorResponse;
        let processForClasses: Map<string, ClassProcess>;
        let projectConfiguration: ProjectConfiguration;

        const promiseListenForChanges: Promise<BundlerRestartResponse> =
            listenForChanges(undefined);
        const bundlerPromise: Promise<BundlerRestartResponse> = prepareLocalEnvironment(
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

        // Start docker container
        if (yamlProjectConfiguration.database) {
            console.log(`we have a db and the db is ${yamlProjectConfiguration.database}`);
        }

        // Start HTTP Server
        const server = await startServerHttp(
            options.port,
            projectConfiguration.astSummary,
            yamlProjectConfiguration.name,
            processForClasses,
        );

        // Start cron jobs
        const crons = await startCronJobs(projectConfiguration, processForClasses);

        if (sdkConfiguration) {
            await replaceUrlsInSdk(
                sdk,
                sdk.files.map((c) => ({
                    name: c.className,
                    cloudUrl: `http://127.0.0.1:${options.port}/${c.className}`,
                })),
            );
            await writeSdkToDisk(sdk, sdkConfiguration.language, sdkConfiguration.path);
            if (
                !yamlProjectConfiguration.sdk &&
                (sdkConfiguration.language === Language.ts ||
                    sdkConfiguration.language === Language.js)
            ) {
                // compile the sdk
                const packajeJson: string = getNodeModulePackageJsonLocal(
                    projectConfiguration.name,
                    projectConfiguration.region,
                );
                await compileSdk(
                    sdkConfiguration.path,
                    packajeJson,
                    sdkConfiguration.language,
                    GenezioCommand.local,
                );
            }
        }

        if (yamlProjectConfiguration.scripts?.postStartLocal) {
            log.info("Running postStartLocal script...");
            log.info(yamlProjectConfiguration.scripts.postStartLocal);
            const success = await runNewProcess(yamlProjectConfiguration.scripts.postStartLocal);
            if (!success) {
                GenezioTelemetry.sendEvent({
                    eventType: TelemetryEventTypes.GENEZIO_POST_START_LOCAL_SCRIPT_ERROR,
                    commandOptions: JSON.stringify(options),
                });
                log.error("postStartLocal script failed.");
                exit(1);
            }
        }

        reportSuccess(projectConfiguration, sdk, options.port, !yamlProjectConfiguration.sdk);

        // Start listening for changes in user's code
        const { watcher } = await listenForChanges(projectConfiguration.sdk?.path);
        if (watcher) {
            watcher.close();
        }
        logChangeDetection();

        // When new changes are detected, close everything and restart the process
        clearAllResources(server, processForClasses, crons);
        GenezioTelemetry.sendEvent({
            eventType: TelemetryEventTypes.GENEZIO_LOCAL_RELOAD,
            commandOptions: JSON.stringify(options),
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
    const bundlersOutputPromise = classes.map((classInfo) => {
        const bundler = getBundler(classInfo);

        if (!bundler) {
            throw new Error("Unsupported language ${classConfiguration.language}.");
        }

        const ast = sdk.sdkGeneratorInput.classesInfo.find(
            (c) => c.classConfiguration.path === classInfo.path,
        )!.program;

        debugLogger.log("Start bundling...");
        return createTemporaryFolder(`${classInfo.name}-${hash(classInfo.path)}`).then(
            async (tmpFolder) => {
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
            },
        );
    });

    const bundlersOutput = await Promise.all(bundlersOutputPromise);

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
        case ".ts": {
            const requiredDepsBundler = new TsRequiredDepsBundler();
            const nodeJsBundler = new NodeJsBundler();
            const localBundler = new NodeJsLocalBundler();
            bundler = new BundlerComposer([requiredDepsBundler, nodeJsBundler, localBundler]);
            break;
        }
        case ".js": {
            const nodeJsBundler = new NodeJsBundler();
            const localBundler = new NodeJsLocalBundler();
            bundler = new BundlerComposer([nodeJsBundler, localBundler]);
            break;
        }
        case ".dart": {
            bundler = new DartBundler();
            break;
        }
        case ".kt": {
            bundler = new KotlinBundler();
            break;
        }
        default: {
            log.error(`Unsupported language ${classConfiguration.language}. Skipping class `);
        }
    }

    return bundler;
}

async function startDockerDatabase(database: string) {
    if (database == "postgres") {
        console.log("THe database is postgres");
    }
}

async function startServerHttp(
    port: number,
    astSummary: AstSummary,
    projectName: string,
    processForClasses: Map<string, ClassProcess>,
): Promise<http.Server> {
    const app = express();
    app.use(cors());
    app.use(bodyParser.raw({ type: () => true, limit: "6mb" }));
    app.use(genezioRequestParser);

    app.get("/get-ast-summary", (req: any, res: any) => {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ ...astSummary, name: projectName }));
    });

    app.all(`/:className`, async (req: any, res: any) => {
        const reqToFunction = getEventObjectFromRequest(req);

        const localProcess = processForClasses.get(req.params.className);

        if (!localProcess) {
            sendResponse(res, {
                body: JSON.stringify({
                    jsonrpc: "2.0",
                    id: 0,
                    error: { code: -32000, message: "Class not found!" },
                }),
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
        } catch (error: any) {
            sendResponse(res, {
                body: JSON.stringify({
                    jsonrpc: "2.0",
                    id: 0,
                    error: { code: -32000, message: "Internal error" },
                }),
            });
            return;
        }
    });

    async function handlerHttpMethod(req: any, res: any) {
        const reqToFunction = getEventObjectFromRequest(req);

        const localProcess = processForClasses.get(req.params.className);

        if (!localProcess) {
            res.status(404).send(`Class ${req.params.className} not found.`);
            return;
        }

        // const response = await axios.post(`http://127.0.0.1:${localProcess?.listeningPort}`, reqToFunction);
        const response = await communicateWithProcess(
            localProcess,
            req.params.className,
            reqToFunction,
            processForClasses,
        );
        sendResponse(res, response.data);
    }

    app.all(`/:className/:methodName`, async (req: any, res: any) => {
        await handlerHttpMethod(req, res);
    });

    app.all(`/:className/:methodName/*`, async (req: any, res: any) => {
        await handlerHttpMethod(req, res);
    });

    return await new Promise((resolve, reject) => {
        const server = app.listen(port, () => {
            log.info(`Server listening on port ${port}`);
            resolve(server);
        });

        server.on("error", (error: any) => {
            if (error.code === "EADDRINUSE") {
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
    cronObject: any;
    process: ClassProcess;
};

async function startCronJobs(
    projectConfiguration: ProjectConfiguration,
    processForClasses: Map<string, ClassProcess>,
): Promise<LocalEnvCronHandler[]> {
    const cronHandlers: LocalEnvCronHandler[] = [];
    for (const classElement of projectConfiguration.classes) {
        const methods = classElement.methods;
        for (const method of methods) {
            if (method.type === "cron" && method.cronString) {
                const cronHandler: LocalEnvCronHandler = {
                    className: classElement.name,
                    methodName: method.name,
                    cronString: rectifyCronString(method.cronString),
                    cronObject: null,
                    process: processForClasses.get(classElement.name)!,
                };

                cronHandler.cronObject = cron.schedule(cronHandler.cronString, async () => {
                    const reqToFunction = {
                        genezioEventType: "cron",
                        methodName: cronHandler.methodName,
                        cronString: cronHandler.cronString,
                    };

                    communicateWithProcess(
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

function getEventObjectFromRequest(request: any) {
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

function sendResponse(res: any, httpResponse: any) {
    if (httpResponse.statusDescription) {
        res.statusMessage = httpResponse.statusDescription;
    }
    let contentTypeHeader = false;

    if (httpResponse.headers) {
        for (const header of Object.keys(httpResponse.headers)) {
            res.setHeader(header.toLowerCase(), httpResponse.headers[header]);

            if (header.toLowerCase() === "content-type") {
                contentTypeHeader = httpResponse.headers[header];
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

async function listenForChanges(sdkPathRelative: any | undefined) {
    const cwd = process.cwd();

    let sdkPath: any = null;

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
        const ignoreFileLines = ignoreFile.split(EOL);
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
                    ignored: ignoredPaths,
                    ignoreInitial: true,
                })
                .on("all", async (event: any, path: any) => {
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
                "options.nodeRuntime",
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

    log.info("\x1b[32m%s\x1b[0m", `Test your code at ${LOCAL_TEST_INTERFACE_URL}?port=${port}`);
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
    data: any,
    processForClasses: Map<string, ClassProcess>,
): Promise<AxiosResponse> {
    try {
        return await axios.post(`http://127.0.0.1:${localProcess?.listeningPort}`, data);
    } catch (error: any) {
        if (error.code === "ECONNRESET" || error.code === "ECONNREFUSED") {
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
