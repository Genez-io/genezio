import { AxiosError } from "axios";
import log from "loglevel";
import path from "path";
import { exit } from "process";
import { BundlerInterface } from "../bundlers/bundler.interface.js";
import { BundlerComposer } from "../bundlers/bundlerComposer.js";
import { DartBundler } from "../bundlers/dart/dartBundler.js";
import { NodeJsBinaryDependenciesBundler } from "../bundlers/node/nodeJsBinaryDependenciesBundler.js";
import { NodeJsBundler } from "../bundlers/node/nodeJsBundler.js";
import { REACT_APP_BASE_URL } from "../constants.js";
import { KotlinBundler } from "../bundlers/kotlin/kotlinBundler.js";
import { GENEZIO_NOT_AUTH_ERROR_MSG, GENEZIO_NO_CLASSES_FOUND } from "../errors.js";
import { sdkGeneratorApiHandler } from "../generateSdk/generateSdkApi.js";
import { ProjectConfiguration } from "../models/projectConfiguration.js";
import { SdkGeneratorResponse } from "../models/sdkGeneratorResponse.js";
import { isLoggedIn } from "../utils/accounts.js";
import { getProjectConfiguration } from "../utils/configuration.js";
import { getNoMethodClasses } from "../utils/getNoMethodClasses.js";
import {
    fileExists,
    createTemporaryFolder,
    zipDirectory,
    isDirectoryEmpty,
    directoryContainsIndexHtmlFiles,
    directoryContainsHtmlFiles,
    deleteFolder,
    getBundleFolderSizeLimit,
    readEnvironmentVariablesFile,
    createLocalTempFolder,
    zipFile,
} from "../utils/file.js";
import { printAdaptiveLog, debugLogger } from "../utils/logging.js";
import { runNewProcess } from "../utils/process.js";
import { GenezioCommand, reportSuccess } from "../utils/reporter.js";
import { replaceUrlsInSdk, writeSdkToDisk } from "../utils/sdk.js";
import { generateRandomSubdomain } from "../utils/yaml.js";
import cliProgress from "cli-progress";
import { Language, YamlProjectConfiguration } from "../models/yamlProjectConfiguration.js";
import { GenezioCloudAdapter } from "../cloudAdapter/genezio/genezioAdapter.js";
import { SelfHostedAwsAdapter } from "../cloudAdapter/aws/selfHostedAwsAdapter.js";
import { CloudAdapter, GenezioCloudInput } from "../cloudAdapter/cloudAdapter.js";
import { CloudProviderIdentifier } from "../models/cloudProviderIdentifier.js";
import { TypeCheckerBundler } from "../bundlers/node/typeCheckerBundler.js";
import { GenezioDeployOptions } from "../models/commandOptions.js";
import { GenezioTelemetry, TelemetryEventTypes } from "../telemetry/telemetry.js";
import { TsRequiredDepsBundler } from "../bundlers/node/typescriptRequiredDepsBundler.js";
import { setEnvironmentVariables } from "../requests/setEnvironmentVariables.js";
import colors from "colors";
import { getEnvironmentVariables } from "../requests/getEnvironmentVariables.js";
import { getNodeModulePackageJson } from "../generateSdk/templates/packageJson.js";
import { getProjectEnvFromProject } from "../requests/getProjectInfo.js";
import { compileSdk } from "../generateSdk/utils/compileSdk.js";
import { interruptLocalProcesses } from "../utils/localInterrupt.js";
import { Status } from "../requests/models.js";
import { loginCommand } from "./login.js";
import { GoBundler } from "../bundlers/go/goBundler.js";

export async function deployCommand(options: GenezioDeployOptions) {
    await interruptLocalProcesses();
    let configuration;

    try {
        configuration = await getProjectConfiguration();
    } catch (error) {
        if (error instanceof Error) {
            log.error(error.message);
            await GenezioTelemetry.sendEvent({
                eventType: TelemetryEventTypes.GENEZIO_DEPLOY_ERROR,
                errorTrace: error.toString(),
                commandOptions: JSON.stringify(options),
            });
        }
        exit(1);
    }
    const backendCwd = configuration.workspace?.backend || process.cwd();
    const frontendCwd = configuration.workspace?.frontend || process.cwd();

    // check if user is logged in
    if (configuration.cloudProvider !== CloudProviderIdentifier.SELF_HOSTED_AWS) {
        if (!(await isLoggedIn())) {
            debugLogger.debug("No auth token found. Starting automatic authentication...");
            await loginCommand("", false);
        }
    }

    const cloudAdapter = getCloudProvider(
        configuration.cloudProvider || CloudProviderIdentifier.AWS,
    );

    if (!options.frontend || options.backend) {
        if (configuration.classes.length === 0) {
            log.error(
                "No classes were found in your genezio.yaml. Add some to be able to deploy your backend.",
            );
        } else {
            if (configuration.scripts?.preBackendDeploy) {
                log.info("Running preBackendDeploy script...");
                log.info(configuration.scripts.preBackendDeploy);
                const success = await runNewProcess(
                    configuration.scripts.preBackendDeploy,
                    backendCwd,
                );
                if (!success) {
                    await GenezioTelemetry.sendEvent({
                        eventType: TelemetryEventTypes.GENEZIO_PRE_BACKEND_DEPLOY_SCRIPT_ERROR,
                        commandOptions: JSON.stringify(options),
                    });
                    log.error("preBackendDeploy script failed.");
                    exit(1);
                }
            }

            await GenezioTelemetry.sendEvent({
                eventType: TelemetryEventTypes.GENEZIO_BACKEND_DEPLOY_START,
                cloudProvider: configuration.cloudProvider,
                commandOptions: JSON.stringify(options),
            });
            await deployClasses(configuration, cloudAdapter, options).catch(
                async (error: AxiosError<Status>) => {
                    await GenezioTelemetry.sendEvent({
                        eventType: TelemetryEventTypes.GENEZIO_BACKEND_DEPLOY_ERROR,
                        errorTrace: error.toString(),
                        commandOptions: JSON.stringify(options),
                    });

                    const data = error.response?.data;

                    switch (error.response?.status) {
                        case 401:
                            log.error(GENEZIO_NOT_AUTH_ERROR_MSG);
                            break;
                        case 500:
                            log.error(error.message);
                            if (data && data.status === "error") {
                                log.error(data.error.message);
                            }
                            break;
                        case 400:
                            log.error(error.message);
                            if (data && data.status === "error") {
                                log.error(data.error.message);
                            }
                            break;
                        default:
                            if (error.message) {
                                log.error(error.message);
                            }
                            break;
                    }
                    exit(1);
                },
            );
            await GenezioTelemetry.sendEvent({
                eventType: TelemetryEventTypes.GENEZIO_BACKEND_DEPLOY_END,
                cloudProvider: configuration.cloudProvider,
                commandOptions: JSON.stringify(options),
            });

            if (configuration.scripts?.postBackendDeploy) {
                log.info("Running postBackendDeploy script...");
                log.info(configuration.scripts.postBackendDeploy);
                const success = await runNewProcess(
                    configuration.scripts.postBackendDeploy,
                    backendCwd,
                );
                if (!success) {
                    await GenezioTelemetry.sendEvent({
                        eventType: TelemetryEventTypes.GENEZIO_POST_BACKEND_DEPLOY_SCRIPT_ERROR,
                        commandOptions: JSON.stringify(options),
                    });
                    log.error("postBackendDeploy script failed.");
                    exit(1);
                }
            }
        }
    }

    if (!options.backend || options.frontend) {
        if (configuration.scripts?.preFrontendDeploy) {
            log.info("Running preFrontendDeploy script...");
            log.info(configuration.scripts.preFrontendDeploy);
            const success = await runNewProcess(
                configuration.scripts.preFrontendDeploy,
                frontendCwd,
            );
            if (!success) {
                await GenezioTelemetry.sendEvent({
                    eventType: TelemetryEventTypes.GENEZIO_PRE_FRONTEND_DEPLOY_SCRIPT_ERROR,
                    commandOptions: JSON.stringify(options),
                });
                log.error("preFrontendDeploy script failed.");
                exit(1);
            }
        }

        await GenezioTelemetry.sendEvent({
            eventType: TelemetryEventTypes.GENEZIO_FRONTEND_DEPLOY_START,
            commandOptions: JSON.stringify(options),
        });

        log.info("Deploying your frontend to the genezio infrastructure...");
        let url;
        try {
            url = await deployFrontend(configuration, cloudAdapter, options);
        } catch (error) {
            if (error instanceof Error) {
                log.error(error.message);
                if (error.message == "No frontend entry in genezio configuration file.") {
                    exit(0);
                }
                await GenezioTelemetry.sendEvent({
                    eventType: TelemetryEventTypes.GENEZIO_FRONTEND_DEPLOY_ERROR,
                    errorTrace: error.toString(),
                    commandOptions: JSON.stringify(options),
                });
            }
            exit(1);
        }
        log.info("\x1b[36m%s\x1b[0m", `Frontend successfully deployed at ${url}`);

        await GenezioTelemetry.sendEvent({
            eventType: TelemetryEventTypes.GENEZIO_FRONTEND_DEPLOY_END,
            commandOptions: JSON.stringify(options),
        });

        if (configuration.scripts?.postFrontendDeploy) {
            log.info("Running postFrontendDeploy script...");
            log.info(configuration.scripts.postFrontendDeploy);
            const success = await runNewProcess(
                configuration.scripts.postFrontendDeploy,
                frontendCwd,
            );
            if (!success) {
                await GenezioTelemetry.sendEvent({
                    eventType: TelemetryEventTypes.GENEZIO_POST_FRONTEND_DEPLOY_SCRIPT_ERROR,
                    commandOptions: JSON.stringify(options),
                });
                log.error("postFrontendDeploy script failed.");
                exit(1);
            }
        }
    }
}

export async function deployClasses(
    configuration: YamlProjectConfiguration,
    cloudAdapter: CloudAdapter,
    options: GenezioDeployOptions,
) {
    if (configuration.classes.length === 0) {
        throw new Error(GENEZIO_NO_CLASSES_FOUND);
    }

    // get options
    const installDeps: boolean = options.installDeps || false;
    const stage: string = options.stage || "prod";

    const sdkResponse: SdkGeneratorResponse = await sdkGeneratorApiHandler(configuration).catch(
        (error) => {
            // TODO: this is not very generic error handling. The SDK should throw Genezio errors, not babel.
            if (error.code === "BABEL_PARSER_SYNTAX_ERROR") {
                log.error("Syntax error:");
                log.error(`Reason Code: ${error.reasonCode}`);
                log.error(`File: ${error.path}:${error.loc.line}:${error.loc.column}`);
            }

            throw error;
        },
    );
    const projectConfiguration = new ProjectConfiguration(configuration, sdkResponse);

    const classesWithNoMethods = getNoMethodClasses(projectConfiguration.classes);
    if (classesWithNoMethods.length) {
        const errorClasses = classesWithNoMethods.join(", ");
        throw new Error(
            `Unable to deploy classes [${errorClasses}] as they do not have any methods.`,
        );
    }

    new cliProgress.MultiBar(
        {
            clearOnComplete: false,
            hideCursor: true,
            format: "Uploading {filename}: {bar} | {value}% | {eta_formatted}",
        },
        cliProgress.Presets.shades_grey,
    );

    printAdaptiveLog("Bundling your code", "start");
    const bundlerResult: Promise<GenezioCloudInput>[] = projectConfiguration.classes.map(
        async (element) => {
            if (!(await fileExists(element.path))) {
                printAdaptiveLog("Bundling your code and uploading it", "error");
                log.error(`\`${element.path}\` file does not exist at the indicated path.`);

                throw new Error(`\`${element.path}\` file does not exist at the indicated path.`);
            }

            let bundler: BundlerInterface;

            switch (element.language) {
                case ".ts": {
                    const requiredDepsBundler = new TsRequiredDepsBundler();
                    const typeCheckerBundler = new TypeCheckerBundler();
                    const standardBundler = new NodeJsBundler();
                    const binaryDepBundler = new NodeJsBinaryDependenciesBundler();
                    bundler = new BundlerComposer([
                        requiredDepsBundler,
                        typeCheckerBundler,
                        standardBundler,
                        binaryDepBundler,
                    ]);
                    break;
                }
                case ".js": {
                    const standardBundler = new NodeJsBundler();
                    const binaryDepBundler = new NodeJsBinaryDependenciesBundler();
                    bundler = new BundlerComposer([standardBundler, binaryDepBundler]);
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
                case ".go": {
                    bundler = new GoBundler();
                    break;
                }
                default:
                    log.error(`Unsupported ${element.language}`);
                    throw new Error(`Unsupported ${element.language}`);
            }

            debugLogger.debug(`The bundling process has started for file ${element.path}...`);

            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const ast = sdkResponse.sdkGeneratorInput.classesInfo.find(
                (classInfo) => classInfo.classConfiguration.path === element.path,
            )!.program;

            const tmpFolder = await createTemporaryFolder();
            const output = await bundler.bundle({
                projectConfiguration: projectConfiguration,
                genezioConfigurationFilePath: process.cwd(),
                ast: ast,
                configuration: element,
                path: element.path,
                extra: {
                    mode: "production",
                    tmpFolder: tmpFolder,
                    installDeps,
                },
            });
            debugLogger.debug(
                `The bundling process finished successfully for file ${element.path}.`,
            );

            // check if the unzipped folder is smaller than 250MB
            const unzippedBundleSize: number = await getBundleFolderSizeLimit(output.path);
            debugLogger.debug(
                `The unzippedBundleSize for class ${element.path} is ${unzippedBundleSize}.`,
            );

            // .jar files cannot be parsed by AWS Lambda, skip this step for AWS Lambda
            if (
                element.language === ".kt" &&
                (configuration.cloudProvider === "aws" || configuration.cloudProvider === undefined)
            ) {
                console.debug("Skipping ZIP due to .jar file");
                console.debug(path.join(output.path, "app-standalone.jar"));
                return {
                    name: element.name,
                    archivePath: path.join(output.path, "app-standalone.jar"),
                    filePath: element.path,
                    methods: element.methods,
                    unzippedBundleSize,
                };
            }

            const archivePathTempFolder = await createTemporaryFolder();
            const archivePath = path.join(archivePathTempFolder, `genezioDeploy.zip`);

            debugLogger.debug(`Zip the directory ${output.path}.`);
            if (element.language === ".go") {
                await zipFile(path.join(output.path, "bootstrap"), archivePath);
            } else {
                await zipDirectory(output.path, archivePath);
            }

            await deleteFolder(output.path);

            return {
                name: element.name,
                archivePath: archivePath,
                filePath: element.path,
                methods: element.methods,
                unzippedBundleSize: unzippedBundleSize,
                dependenciesInfo: output.extra.dependenciesInfo,
                allNonJsFilesPaths: output.extra.allNonJsFilesPaths,
            };
        },
    );

    const bundlerResultArray = await Promise.all(bundlerResult);

    printAdaptiveLog("Bundling your code", "end");

    projectConfiguration.astSummary.classes = projectConfiguration.astSummary.classes.map((c) => {
        // remove cwd from path and the extension
        return {
            ...c,
            path: path.relative(process.cwd(), c.path).replace(/\.[^/.]+$/, ""),
        };
    });

    projectConfiguration.classes = projectConfiguration.classes.map((c) => {
        // remove cwd from path and the extension
        return {
            ...c,
            path: path.relative(process.cwd(), c.path).replace(/\.[^/.]+$/, ""),
        };
    });

    const result = await cloudAdapter.deploy(bundlerResultArray, projectConfiguration, {
        stage: stage,
    });

    await replaceUrlsInSdk(
        sdkResponse,
        result.classes.map((c) => ({
            name: c.className,
            cloudUrl: c.functionUrl,
        })),
    );

    if (configuration.sdk) {
        await writeSdkToDisk(sdkResponse, configuration.sdk.path);
    } else if (configuration.language === Language.ts || configuration.language === Language.js) {
        const localPath = await createLocalTempFolder(
            `${projectConfiguration.name}-${projectConfiguration.region}`,
        );
        await writeSdkToDisk(sdkResponse, path.join(localPath, "sdk"));
        const packageJson: string = getNodeModulePackageJson(
            configuration.name,
            configuration.region,
            stage,
        );
        await compileSdk(path.join(localPath, "sdk"), packageJson, configuration.language, true);
    }

    reportSuccess(
        result.classes,
        sdkResponse,
        GenezioCommand.deploy,
        {
            name: configuration.name,
            region: configuration.region,
            stage: stage,
        },
        !configuration.sdk,
    );

    const projectId = result.classes[0].projectId;
    const projectEnvId = result.projectEnvId;
    if (projectId) {
        // Deploy environment variables if --upload-env is true
        if (options.env) {
            const envFile = path.join(process.cwd(), options.env);
            debugLogger.debug(`Loading environment variables from ${envFile}.`);

            if (!(await fileExists(envFile))) {
                // There is no need to exit the process here, as the project has been deployed
                log.error(`File ${envFile} does not exists. Please provide the correct path.`);
                await GenezioTelemetry.sendEvent({
                    eventType: TelemetryEventTypes.GENEZIO_DEPLOY_ERROR,
                    errorTrace: `File ${envFile} does not exists`,
                });
            } else {
                // Read environment variables from .env file
                const envVars = await readEnvironmentVariablesFile(envFile);
                const projectEnv = await getProjectEnvFromProject(projectId, stage);

                if (!projectEnv) {
                    throw new Error("Project environment not found.");
                }

                // Upload environment variables to the project
                await setEnvironmentVariables(projectId, projectEnv.id, envVars)
                    .then(async () => {
                        debugLogger.debug(
                            `Environment variables from ${envFile} uploaded to project ${projectId}`,
                        );
                        log.info(
                            `The environment variables were uploaded to the project successfully.`,
                        );
                        await GenezioTelemetry.sendEvent({
                            eventType: TelemetryEventTypes.GENEZIO_DEPLOY_LOAD_ENV_VARS,
                        });
                    })
                    .catch(async (error: AxiosError) => {
                        log.error(`Loading environment variables failed with: ${error.message}`);
                        log.error(
                            `Try to set the environment variables using the dashboard ${colors.cyan(
                                REACT_APP_BASE_URL,
                            )}`,
                        );
                        await GenezioTelemetry.sendEvent({
                            eventType: TelemetryEventTypes.GENEZIO_DEPLOY_ERROR,
                            errorTrace: error.toString(),
                        });
                    });
            }
        } else {
            const cwd = projectConfiguration.workspace?.backend
                ? path.resolve(projectConfiguration.workspace.backend)
                : process.cwd();
            const envFile = path.join(cwd, ".env");
            if (await fileExists(envFile)) {
                // read envVars from file
                const envVars = await readEnvironmentVariablesFile(envFile);
                const projectEnv = await getProjectEnvFromProject(projectId, stage);

                if (!projectEnv) {
                    throw new Error("Project environment not found.");
                }

                // get remoteEnvVars from project
                const remoteEnvVars = await getEnvironmentVariables(projectId, projectEnv.id);

                // check if all envVars from file are in remoteEnvVars
                const missingEnvVars = envVars.filter(
                    (envVar) =>
                        !remoteEnvVars.find((remoteEnvVar) => remoteEnvVar.name === envVar.name),
                );

                // Print missing env vars
                if (missingEnvVars.length > 0) {
                    log.info(
                        `${colors.yellow(
                            "Warning: The following environment variables are not set on your project: ",
                        )}`,
                    );
                    missingEnvVars.forEach((envVar) => {
                        log.info(`${colors.yellow(envVar.name)}`);
                    });

                    const relativeEnvFilePath = path.join(
                        ".",
                        path.relative(path.resolve(process.cwd()), path.resolve(envFile)),
                    );

                    log.info("");
                    log.info(
                        `${colors.yellow("Go to the dashboard ")}${colors.cyan(
                            REACT_APP_BASE_URL,
                        )} ${colors.yellow(
                            "to set your environment variables or run ",
                        )} ${colors.cyan(`genezio deploy --env ${relativeEnvFilePath}`)}`,
                    );
                    log.info("");
                }
            }
        }

        log.info(
            `Your backend project has been deployed and is available at ${REACT_APP_BASE_URL}/project/${projectId}/${projectEnvId}`,
        );
    }
}

export async function deployFrontend(
    configuration: YamlProjectConfiguration,
    cloudAdapter: CloudAdapter,
    options: GenezioDeployOptions,
) {
    const stage: string = options.stage || "";
    if (configuration.frontend) {
        // check if subdomain contains only numbers, letters and hyphens
        if (
            configuration.frontend.subdomain &&
            !configuration.frontend.subdomain.match(/^[a-z0-9-]+$/)
        ) {
            throw new Error(`The subdomain can only contain letters, numbers and hyphens.`);
        }
        // check if the build folder exists
        const frontendPath = configuration.frontend?.path;
        if (!(await fileExists(frontendPath))) {
            throw new Error(
                `The build folder ${colors.cyan(
                    `${frontendPath}`,
                )} does not exist. Please run the build command first or add a preFrontendDeploy script in the genezio.yaml file.`,
            );
        }

        // check if the build folder is empty
        if (await isDirectoryEmpty(frontendPath)) {
            throw new Error(
                `The build folder ${colors.cyan(
                    `${frontendPath}`,
                )} is empty. Please run the build command first or add a preFrontendDeploy script in the genezio.yaml file.`,
            );
        }

        // check if there are any .html files in the build folder
        if (!(await directoryContainsHtmlFiles(frontendPath))) {
            log.info("WARNING: No .html files found in the build folder");
        } else if (!(await directoryContainsIndexHtmlFiles(frontendPath))) {
            // check if there is no index.html file in the build folder
            log.info("WARNING: No index.html file found in the build folder");
        }

        configuration.frontend.subdomain = options.subdomain || configuration.frontend.subdomain;
        if (!configuration.frontend.subdomain) {
            log.info(
                "No subdomain specified in the genezio.yaml configuration file or as an option flag. We will provide a random one for you.",
            );

            // write the configuration in yaml file
            await configuration.addSubdomain(generateRandomSubdomain());
        }

        const url = await cloudAdapter.deployFrontend(
            configuration.name,
            configuration.region,
            configuration.frontend,
            stage,
        );
        return url;
    } else {
        throw new Error("No frontend entry in genezio configuration file.");
    }
}

function getCloudProvider(provider: string): CloudAdapter {
    switch (provider) {
        case CloudProviderIdentifier.AWS:
        case CloudProviderIdentifier.GENEZIO:
        case CloudProviderIdentifier.CAPYBARA:
            return new GenezioCloudAdapter();
        case CloudProviderIdentifier.CAPYBARA_LINUX:
            return new GenezioCloudAdapter();
        case CloudProviderIdentifier.SELF_HOSTED_AWS:
            return new SelfHostedAwsAdapter();
        default:
            throw new Error(`Unsupported cloud provider: ${provider}`);
    }
}
