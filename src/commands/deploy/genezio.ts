import { AxiosError } from "axios";
import git from "isomorphic-git";
import { log } from "../../utils/logging.js";
import path from "path";
import { exit } from "process";
import {
    DASHBOARD_URL,
    RECOMMENTDED_GENEZIO_TYPES_VERSION_RANGE,
    REQUIRED_GENEZIO_TYPES_VERSION_RANGE,
} from "../../constants.js";
import { GENEZIO_NO_CLASSES_FOUND, UserError } from "../../errors.js";
import {
    mapYamlClassToSdkClassConfiguration,
    sdkGeneratorApiHandler,
} from "../../generateSdk/generateSdkApi.js";
import { FunctionConfiguration, ProjectConfiguration } from "../../models/projectConfiguration.js";
import { SdkHandlerResponse } from "../../models/sdkGeneratorResponse.js";
import { getNoMethodClasses } from "../../utils/getNoMethodClasses.js";
import {
    fileExists,
    createTemporaryFolder,
    zipDirectory,
    isDirectoryEmpty,
    directoryContainsIndexHtmlFiles,
    directoryContainsHtmlFiles,
    deleteFolder,
    getBundleFolderSizeLimit,
    zipFile,
} from "../../utils/file.js";
import { printAdaptiveLog, debugLogger, doAdaptiveLogAction } from "../../utils/logging.js";
import { GenezioCommand, reportSuccess, reportSuccessFunctions } from "../../utils/reporter.js";
import { generateRandomSubdomain } from "../../utils/yaml.js";
import cliProgress from "cli-progress";
import { YAMLBackend, YamlProjectConfiguration } from "../../projectConfiguration/yaml/v2.js";
import { GenezioCloudAdapter } from "../../cloudAdapter/genezio/genezioAdapter.js";
import {
    CloudAdapter,
    GenezioCloudInput,
    GenezioCloudInputType,
    GenezioCloudOutput,
} from "../../cloudAdapter/cloudAdapter.js";
import { CloudProviderIdentifier } from "../../models/cloudProviderIdentifier.js";
import { GenezioDeployOptions } from "../../models/commandOptions.js";
import { GenezioTelemetry, TelemetryEventTypes } from "../../telemetry/telemetry.js";
import colors from "colors";
import { Status } from "../../requests/models.js";
import { bundle } from "../../bundlers/utils.js";
import {
    checkExperimentalDecorators,
    isDependencyVersionCompatible,
} from "../../utils/jsProjectChecker.js";
import { YamlConfigurationIOController } from "../../projectConfiguration/yaml/v2.js";
import {
    AuthenticationEmailTemplateType,
    entryFileFunctionMap,
    Language,
} from "../../projectConfiguration/yaml/models.js";
import { runScript } from "../../utils/scripts.js";
import { scanClassesForDecorators } from "../../utils/configuration.js";
import configIOController, { YamlFrontend } from "../../projectConfiguration/yaml/v2.js";
import { ClusterCloudAdapter } from "../../cloudAdapter/cluster/clusterAdapter.js";
import { writeSdk } from "../../generateSdk/sdkWriter/sdkWriter.js";
import { reportSuccessForSdk } from "../../generateSdk/sdkSuccessReport.js";
import { isLoggedIn } from "../../utils/accounts.js";
import { loginCommand } from "../login.js";
import fsExtra from "fs-extra/esm";
import { getLinkedFrontendsForProject } from "../../utils/linkDatabase.js";
import { getCloudProvider } from "../../requests/getCloudProvider.js";
import fs, { mkdirSync } from "fs";
import {
    getOrCreateDatabase,
    getOrCreateEmptyProject,
    uploadEnvVarsFromFile,
    enableAuthentication,
    uploadUserCode,
    setAuthenticationEmailTemplates,
    evaluateResource,
} from "./utils.js";
import {
    disableEmailIntegration,
    enableEmailIntegration,
    getProjectIntegrations,
} from "../../requests/integration.js";
import { expandEnvironmentVariables, findAnEnvFile } from "../../utils/environmentVariables.js";
import { getProjectEnvFromProjectByName } from "../../requests/getProjectInfoByName.js";
import { getFunctionHandlerProvider } from "../../utils/getFunctionHandlerProvider.js";
import { getFunctionEntryFilename } from "../../utils/getFunctionEntryFilename.js";
import { CronDetails } from "../../models/requests.js";
import { syncCrons } from "../../requests/crons.js";
import { getPackageManager } from "../../packageManagers/packageManager.js";
import { supportedPythonDepsInstallVersion } from "../../models/projectOptions.js";

export async function genezioDeploy(options: GenezioDeployOptions) {
    const configIOController = new YamlConfigurationIOController(options.config, {
        stage: options.stage,
    });
    const configuration = await configIOController.read();
    if (!configuration.backend && !configuration.frontend) {
        throw new UserError(
            "Nothing to deploy. Please add a backend or frontend configuration to your genezio.yaml.",
        );
    }
    const backendCwd = configuration.backend?.path || process.cwd();

    // We need to check if the user is using an older version of @genezio/types
    // because we migrated the decorators implemented in the @genezio/types package to the stage 3 implementation.
    // Otherwise, the user will get an error at runtime. This check can be removed in the future once no one is using version
    // 0.1.* of @genezio/types.
    if (
        configuration.backend?.language.name === Language.ts ||
        configuration.backend?.language.name === Language.js
    ) {
        const packageJsonPath = path.join(backendCwd, "package.json");
        if (
            isDependencyVersionCompatible(
                packageJsonPath,
                "@genezio/types",
                REQUIRED_GENEZIO_TYPES_VERSION_RANGE,
            ) === false
        ) {
            throw new UserError(
                `You are currently using an older version of @genezio/types, which is not compatible with this version of the genezio CLI. To solve this, please update the @genezio/types package on your backend component using the following command: npm install @genezio/types@${RECOMMENTDED_GENEZIO_TYPES_VERSION_RANGE}`,
            );
        }

        checkExperimentalDecorators(backendCwd);
    }

    // check if user is logged in
    if (!(await isLoggedIn())) {
        debugLogger.debug("No auth token found. Starting automatic authentication...");
        await loginCommand("", false);
    }

    const projectName = configuration.name;

    if (configuration.services) {
        const projectDetails = await getOrCreateEmptyProject(
            projectName,
            configuration.region,
            options.stage || "prod",
        );

        if (!projectDetails) {
            throw new UserError("Could not create project.");
        }

        if (configuration.services?.databases) {
            const databases = configuration.services.databases;

            for (const database of databases) {
                if (!database.region) {
                    database.region = configuration.region;
                }
                await getOrCreateDatabase(
                    {
                        name: database.name,
                        region: database.region,
                        type: database.type,
                    },
                    options.stage || "prod",
                    projectDetails.projectId,
                    projectDetails.projectEnvId,
                );
            }
        }

        if (configuration.services?.email !== undefined) {
            const isEnabled = (
                await getProjectIntegrations(projectDetails.projectId, projectDetails.projectEnvId)
            ).integrations.find((integration) => integration === "EMAIL-SERVICE");

            if (configuration.services?.email && !isEnabled) {
                await enableEmailIntegration(projectDetails.projectId, projectDetails.projectEnvId);
                log.info("Email integration enabled successfully.");
            } else if (configuration.services?.email === false && isEnabled) {
                await disableEmailIntegration(
                    projectDetails.projectId,
                    projectDetails.projectEnvId,
                );
                log.info("Email integration disabled successfully.");
            }
        }

        if (configuration.services?.authentication) {
            const envFile = options.env || (await findAnEnvFile(process.cwd()));
            await enableAuthentication(
                configuration,
                projectDetails.projectId,
                projectDetails.projectEnvId,
                options.stage || "prod",
                envFile,
            );
        }
    }

    let deployClassesResult;
    backend: if (configuration.backend && !options.frontend) {
        if (configuration.backend.classes?.length === 0) {
            log.error(
                "No classes were found in your genezio.yaml. Add some to be able to deploy your backend.",
            );
            break backend;
        }

        await doAdaptiveLogAction("Running backend deploy scripts", async () => {
            await runScript(configuration.backend?.scripts?.deploy, backendCwd);
        }).catch(async (error) => {
            await GenezioTelemetry.sendEvent({
                eventType: TelemetryEventTypes.GENEZIO_PRE_BACKEND_DEPLOY_SCRIPT_ERROR,
                commandOptions: JSON.stringify(options),
            });
            throw error;
        });

        await GenezioTelemetry.sendEvent({
            eventType: TelemetryEventTypes.GENEZIO_BACKEND_DEPLOY_START,
            commandOptions: JSON.stringify(options),
        });
        deployClassesResult = await deployClasses(configuration, options).catch(
            async (error: AxiosError<Status>) => {
                await GenezioTelemetry.sendEvent({
                    eventType: TelemetryEventTypes.GENEZIO_BACKEND_DEPLOY_ERROR,
                    errorTrace: error.toString(),
                    commandOptions: JSON.stringify(options),
                });
                throw error;
            },
        );
        await GenezioTelemetry.sendEvent({
            eventType: TelemetryEventTypes.GENEZIO_BACKEND_DEPLOY_END,
            commandOptions: JSON.stringify(options),
        });
    }

    if (configuration.services?.crons) {
        const crons: CronDetails[] = [];
        for (const cron of configuration.services.crons) {
            const yamlFunctionName = await evaluateResource(
                configuration,
                cron.function,
                options.stage || "prod",
                undefined,
                undefined,
            );
            if (!deployClassesResult) {
                throw new UserError(
                    "Could not deploy cron jobs. Please make sure your backend is deployed before adding cron jobs.",
                );
            }
            const functions = deployClassesResult.functions ?? [];
            const cronFunction = functions.find((f) => f.name === `function-${yamlFunctionName}`);
            if (!cronFunction) {
                throw new UserError(
                    `Function ${yamlFunctionName} not found. Please make sure the function is deployed before adding cron jobs.`,
                );
            }
            crons.push({
                name: cron.name,
                url: cronFunction.cloudUrl,
                endpoint: cron.endpoint || "",
                cronString: cron.schedule,
            });
        }
        await syncCrons({
            projectName: projectName,
            stageName: options.stage || "prod",
            crons: crons,
        }).catch((error) => {
            throw new UserError(
                `Something went wrong while syncing the cron jobs.\n${error}\nPlease try to redeploy your project. If the problem persists, please contact support at contact@genez.io.`,
            );
        });
    } else {
        await syncCrons({
            projectName: projectName,
            stageName: options.stage || "prod",
            crons: [],
        }).catch(() => {
            throw new UserError(
                "Something went wrong while syncing the cron jobs. Please try to redeploy your project. If the problem persists, please contact support at contact@genez.io.",
            );
        });
    }

    const frontendUrls = [];
    if (configuration.frontend && !options.backend) {
        const frontends = configuration.frontend;

        for (const [index, frontend] of frontends.entries()) {
            try {
                await doAdaptiveLogAction(
                    `Running frontend ${index + 1} deploy script`,
                    async () => {
                        const newEnvObject = await expandEnvironmentVariables(
                            frontend.environment,
                            configuration,
                            options.stage,
                            /* envFile */ undefined,
                            /* options */ undefined,
                        );

                        debugLogger.debug(
                            `Environment variables injected for frontend.scripts.deploy:`,
                            JSON.stringify(newEnvObject),
                        );
                        return await runScript(
                            frontend.scripts?.deploy,
                            frontend.path || process.cwd(),
                            newEnvObject,
                        );
                    },
                );
            } catch (error) {
                await GenezioTelemetry.sendEvent({
                    eventType: TelemetryEventTypes.GENEZIO_PRE_FRONTEND_DEPLOY_SCRIPT_ERROR,
                    commandOptions: JSON.stringify(options),
                });
                throw error;
            }

            await GenezioTelemetry.sendEvent({
                eventType: TelemetryEventTypes.GENEZIO_FRONTEND_DEPLOY_START,
                commandOptions: JSON.stringify(options),
            });

            log.info("Deploying your frontend to the genezio infrastructure...");
            const frontendUrl = await deployFrontend(
                configuration.name,
                configuration.region,
                frontend,
                index,
                options,
                configuration,
            ).catch(async (error) => {
                if (error instanceof Error) {
                    if (error.message == "No frontend entry in genezio configuration file.") {
                        log.error(error.message);
                        exit(0);
                    }
                    await GenezioTelemetry.sendEvent({
                        eventType: TelemetryEventTypes.GENEZIO_FRONTEND_DEPLOY_ERROR,
                        errorTrace: error.toString(),
                        commandOptions: JSON.stringify(options),
                    });
                    throw error;
                }
            });
            if (frontendUrl) frontendUrls.push(frontendUrl);

            await GenezioTelemetry.sendEvent({
                eventType: TelemetryEventTypes.GENEZIO_FRONTEND_DEPLOY_END,
                commandOptions: JSON.stringify(options),
            });
        }
    }

    // Add backend environment variables for backend deployments
    // At this point the project and environment should be available in deployClassesResult
    if (configuration.backend && !options.frontend && deployClassesResult) {
        const cwd = configuration.backend.path
            ? path.resolve(configuration.backend.path)
            : process.cwd();
        await uploadEnvVarsFromFile(
            options.env,
            deployClassesResult.projectId,
            deployClassesResult.projectEnvId,
            cwd,
            options.stage || "prod",
            configuration,
        );
    }

    await uploadUserCode(configuration.name, configuration.region, options.stage, process.cwd());

    const settings = configuration.services?.authentication?.settings;
    if (settings) {
        const stage = options.stage || "prod";
        const projectEnv = await getProjectEnvFromProjectByName(projectName, stage);
        if (!projectEnv) {
            throw new UserError(
                `Stage ${stage} not found in project ${projectName}. Please run 'genezio deploy --stage ${stage}' to deploy your project to a new stage.`,
            );
        }

        if (settings?.resetPassword) {
            await setAuthenticationEmailTemplates(
                configuration,
                settings.resetPassword.redirectUrl,
                AuthenticationEmailTemplateType.passwordReset,
                stage,
                projectEnv?.id,
            );
        }

        if (settings.emailVerification) {
            await setAuthenticationEmailTemplates(
                configuration,
                settings.emailVerification.redirectUrl,
                AuthenticationEmailTemplateType.verification,
                stage,
                projectEnv?.id,
            );
        }
    }

    if (deployClassesResult) {
        log.info(
            colors.cyan(
                `App Dashboard URL: ${DASHBOARD_URL}/project/${deployClassesResult.projectId}/${deployClassesResult.projectEnvId}`,
            ),
        );
    }
    for (const frontendUrl of frontendUrls) {
        log.info(colors.cyan(`Frontend URL: ${frontendUrl}`));
    }
}

export async function deployClasses(
    configuration: YamlProjectConfiguration,
    options: GenezioDeployOptions,
) {
    const backend: YAMLBackend = configuration.backend!;
    backend.classes = await scanClassesForDecorators(backend);
    backend.functions = backend.functions ?? [];

    if (backend.classes.length === 0 && backend.functions?.length === 0) {
        throw new UserError(GENEZIO_NO_CLASSES_FOUND(backend.language.name));
    }

    const stack = [];
    if (backend.classes.length > 0) {
        // append typesafe to the stack if there are classes
        stack.push("typesafe");
    }

    const sdkLanguages: Language[] = [];
    // Add configuration frontends that contain the SDK field
    sdkLanguages.push(
        ...((configuration.frontend || [])
            .map((f) => f.sdk?.language)
            .filter((f) => f !== undefined) as Language[]),
    );
    // Add linked frontends
    sdkLanguages.push(
        ...(await getLinkedFrontendsForProject(configuration.name)).map((f) => f.language),
    );

    const sdkResponse: SdkHandlerResponse = await sdkGeneratorApiHandler(
        sdkLanguages,
        mapYamlClassToSdkClassConfiguration(backend.classes, backend.language.name, backend.path),
        backend.path,
        /* packageName= */ `@genezio-sdk/${configuration.name}`,
    ).catch((error) => {
        // TODO: this is not very generic error handling. The SDK should throw Genezio errors, not babel.
        if (error.code === "BABEL_PARSER_SYNTAX_ERROR") {
            log.error("Syntax error:");
            log.error(`Reason Code: ${error.reasonCode}`);
            log.error(`File: ${error.path}:${error.loc.line}:${error.loc.column}`);
        }

        throw error;
    });
    const cloudProvider =
        // TODO: Remove this as soon as Genezio Cloud supports Go
        backend.language.name === Language.go
            ? CloudProviderIdentifier.GENEZIO_AWS
            : await getCloudProvider(configuration.name);
    const projectConfiguration = new ProjectConfiguration(
        configuration,
        cloudProvider,
        sdkResponse,
    );

    const classesWithNoMethods = getNoMethodClasses(projectConfiguration.classes);
    if (classesWithNoMethods.length) {
        const errorClasses = classesWithNoMethods.join(", ");
        throw new UserError(
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

    printAdaptiveLog("Bundling your code\n", "start");
    const bundlerResult: Promise<GenezioCloudInput>[] = projectConfiguration.classes.map(
        async (element) => {
            const ast = sdkResponse.classesInfo.find(
                (classInfo) => classInfo.classConfiguration.path === element.path,
            )!.program;
            const output = await bundle(
                projectConfiguration,
                ast,
                element,
                options.installDeps,
                options.disableOptimization,
            );

            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            // check if the unzipped folder is smaller than 250MB
            const unzippedBundleSize: number = await getBundleFolderSizeLimit(output.path);
            debugLogger.debug(
                `The unzippedBundleSize for class ${element.path} is ${unzippedBundleSize}.`,
            );

            // .jar files cannot be parsed by AWS Lambda, skip this step for AWS Lambda
            if (element.language === "kt") {
                debugLogger.debug("Skipping ZIP due to .jar file");
                debugLogger.debug(path.join(output.path, "app-standalone.jar"));
                return {
                    type: GenezioCloudInputType.CLASS,
                    name: element.name,
                    archivePath: path.join(output.path, "app-standalone.jar"),
                    filePath: element.path,
                    methods: element.methods,
                    unzippedBundleSize,
                    entryFile: output.extra.entryFile ?? "app-standalone.jar",
                };
            }

            const archivePathTempFolder = await createTemporaryFolder();
            const archivePath = path.join(archivePathTempFolder, `genezioDeploy.zip`);

            debugLogger.debug(`Zip the directory ${output.path}.`);
            if (element.language === "go") {
                await zipFile(path.join(output.path, "bootstrap"), archivePath);
            } else {
                await zipDirectory(output.path, archivePath, true, [".git", ".github"]);
            }

            await deleteFolder(output.path);

            return {
                type: GenezioCloudInputType.CLASS,
                name: element.name,
                archivePath: archivePath,
                filePath: element.path,
                methods: element.methods,
                dependenciesInfo: output.extra.dependenciesInfo,
                allNonJsFilesPaths: output.extra.allNonJsFilesPaths,
                unzippedBundleSize: unzippedBundleSize,
                entryFile: output.extra.entryFile ?? "",
                timeout: element.timeout,
                storageSize: element.storageSize,
                instanceSize: element.instanceSize,
                maxConcurrentRequestsPerInstance: element.maxConcurrentRequestsPerInstance,
            };
        },
    );

    const functionsResultArray: Promise<GenezioCloudInput>[] = projectConfiguration.functions.map(
        (f) => functionToCloudInput(f, backend.path, /* outputDir */ undefined),
    );

    const cloudAdapterDeployInput = await Promise.all([
        ...bundlerResult,
        ...functionsResultArray,
    ]).catch((error) => {
        printAdaptiveLog("Bundling your code\n", "error");
        throw error;
    });

    printAdaptiveLog("Bundling your code\n", "end");

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

    const projectGitRepositoryUrl = (await git.listRemotes({ fs, dir: process.cwd() })).find(
        (r) => r.remote === "origin",
    )?.url;

    // TODO: Enable cloud adapter setting for every class
    const cloudAdapter = getCloudAdapter(cloudProvider);
    const result = await cloudAdapter.deploy(
        cloudAdapterDeployInput,
        projectConfiguration,
        {
            stage: options.stage,
        },
        stack,
        /* sourceRepository= */ projectGitRepositoryUrl,
    );

    if (
        sdkResponse.generatorResponses.length > 0 &&
        sdkResponse.generatorResponses[0].files.length <= 0
    ) {
        log.info(colors.cyan("Your backend code was successfully deployed!"));
        return;
    } else {
        log.info(
            colors.cyan(
                `Your backend code was ${result.classes.length > 0 ? "deployed and the SDK was successfully generated" : "successfully deployed"}`,
            ),
        );
    }
    if (result.classes.length > 0) {
        await handleSdk(configuration, result, sdkResponse, options);
        reportSuccess(result.classes);
    }

    if (result.functions.length > 0) {
        reportSuccessFunctions(result.functions);
    }

    const projectId = result.projectId;
    const projectEnvId = result.projectEnvId;
    if (projectId) {
        return {
            projectId: projectId,
            projectEnvId: projectEnvId,
            functions: result.functions,
            classes: result.classes,
        };
    }
}

export async function functionToCloudInput(
    functionElement: FunctionConfiguration,
    backendPath: string,
    outputDir?: string,
): Promise<GenezioCloudInput> {
    const supportedFunctionLanguages = ["js", "ts", "python"];

    if (!supportedFunctionLanguages.includes(functionElement.language)) {
        throw new UserError(
            `The language ${functionElement.language} is not supported for functions. Supported languages are: ${supportedFunctionLanguages.join(", ")}`,
        );
    }
    const handlerProvider = getFunctionHandlerProvider(
        functionElement.type,
        functionElement.language as Language,
    );

    if (outputDir && !fs.existsSync(outputDir)) {
        debugLogger.debug(`Creating output directory ${outputDir}`);
        mkdirSync(outputDir, { recursive: true });
    }
    const tmpFolderPath = await createTemporaryFolder();
    const archivePath = path.join(
        outputDir || (await createTemporaryFolder()),
        `genezioDeploy.zip`,
    );

    if (functionElement.language === "python") {
        await fsExtra.copy(path.join(backendPath), tmpFolderPath);
    } else {
        // copy everything to the temporary folder
        await fsExtra.copy(path.join(backendPath, functionElement.path), tmpFolderPath);
    }
    // Handle JS/TS functions with pnpm
    if (functionElement.language === "js" || functionElement.language === "ts") {
        if (fsExtra.pathExistsSync(path.join(tmpFolderPath, "node_modules", ".pnpm"))) {
            await fsExtra.remove(path.join(tmpFolderPath, "node_modules", ".pnpm"));
            await fsExtra.copy(
                path.join(backendPath, functionElement.path, "node_modules", ".pnpm"),
                path.join(tmpFolderPath, "node_modules", ".pnpm"),
                {
                    dereference: true,
                },
            );
        }
    }

    // Handle Python projects dependencies
    if (functionElement.language === "python") {
        // Requirements file must be in the root of the backend folder
        const requirementsPath = path.join(backendPath, "requirements.txt");
        if (fs.existsSync(requirementsPath)) {
            const requirementsOutputPath = path.join(tmpFolderPath, "requirements.txt");
            const requirementsContent = fs.readFileSync(requirementsOutputPath, "utf8").trim();
            if (requirementsContent) {
                const pathForDependencies = path.join(tmpFolderPath, "packages");
                const packageManager = getPackageManager();
                let installCommand;

                if (packageManager.command === "pip" || packageManager.command === "pip3") {
                    installCommand = `${packageManager.command} install -r ${requirementsOutputPath} --platform manylinux2014_x86_64 --only-binary=:all: --python-version ${supportedPythonDepsInstallVersion} -t ${pathForDependencies}`;
                } else if (packageManager.command === "poetry") {
                    installCommand = `${packageManager.command} install --no-root --directory ${pathForDependencies}`;
                } else {
                    throw new UserError(`Unsupported package manager: ${packageManager.command}`);
                }

                debugLogger.debug(`Installing dependencies using command: ${installCommand}`);
                await runScript(installCommand, tmpFolderPath);
            } else {
                debugLogger.debug("No requirements.txt file found.");
            }
        }
    }

    const unzippedBundleSize = await getBundleFolderSizeLimit(tmpFolderPath);

    // add the handler to the temporary folder
    let entryFileName =
        entryFileFunctionMap[functionElement.language as keyof typeof entryFileFunctionMap];
    while (fs.existsSync(path.join(tmpFolderPath, entryFileName))) {
        debugLogger.debug(
            `[FUNCTION ${functionElement.name}] File ${entryFileName} already exists in the temporary folder.`,
        );
        entryFileName = getFunctionEntryFilename(
            functionElement.language as Language,
            `index-${Math.random().toString(36).substring(7)}`,
        );
    }

    await handlerProvider.write(tmpFolderPath, entryFileName, functionElement);

    debugLogger.debug(`Zip the directory ${tmpFolderPath}.`);

    // zip the temporary folder
    await zipDirectory(tmpFolderPath, archivePath, true, [".git", ".github"]);

    debugLogger.debug(`Zip created at path: ${archivePath}.`);

    await deleteFolder(tmpFolderPath);

    return {
        type: GenezioCloudInputType.FUNCTION as GenezioCloudInputType.FUNCTION,
        name: functionElement.name,
        archivePath: archivePath,
        unzippedBundleSize: unzippedBundleSize,
        entryFile: entryFileName,
        timeout: functionElement.timeout,
        instanceSize: functionElement.instanceSize,
        storageSize: functionElement.storageSize,
        maxConcurrentRequestsPerInstance: functionElement.maxConcurrentRequestsPerInstance,
    };
}

export async function deployFrontend(
    name: string,
    region: string,
    frontend: YamlFrontend,
    index: number,
    options: GenezioDeployOptions,
    configuration: YamlProjectConfiguration,
): Promise<string | undefined> {
    const stage: string = options.stage || "";

    if (frontend.publish === null || frontend.publish === undefined) {
        log.info(
            `Skipping frontend deployment for \`${frontend.path}\` because it has no publish folder in the YAML configuration. Check https://genezio.com/docs/project-structure/genezio-configuration-file for more details.`,
        );
        return;
    }

    await doAdaptiveLogAction(`Building frontend ${index + 1}`, async () => {
        const newEnvObject = await expandEnvironmentVariables(
            frontend.environment,
            configuration,
            options.stage,
            /* envFile */ undefined,
            /* options */ undefined,
        );

        debugLogger.debug(
            `Environment variables injected for frontend.scripts.build:`,
            JSON.stringify(newEnvObject),
        );

        await runScript(frontend.scripts?.build, frontend.path, newEnvObject);
    });

    // check if the frontend publish path exists
    if (!(await fileExists(path.join(frontend.path, frontend.publish)))) {
        throw new UserError(
            `The frontend path ${colors.cyan(
                `${frontend.publish}`,
            )} does not exist. Please make sure the path is correct.`,
        );
    }

    // check if subdomain contains only numbers, letters and hyphens
    if (frontend.subdomain && !frontend.subdomain.match(/^[a-zA-z0-9][a-zA-Z0-9-]{0,62}$/)) {
        throw new UserError(`The subdomain can only contain letters, numbers and hyphens.`);
    }

    // check if the publish folder exists
    const frontendPath = path.join(frontend.path, frontend.publish);
    if (!(await fileExists(frontendPath))) {
        throw new UserError(
            `The publish folder ${colors.cyan(
                `${frontendPath}`,
            )} does not exist. Please run the build command first or add a \`deploy\` script in the genezio.yaml file.`,
        );
    }

    // check if the publish folder is empty
    if (await isDirectoryEmpty(frontendPath)) {
        throw new UserError(
            `The publish folder ${colors.cyan(
                `${frontendPath}`,
            )} is empty. Please run the build command first or add a \`deploy\` script in the genezio.yaml file.`,
        );
    }

    // check if there are any .html files in the publish folder
    if (!(await directoryContainsHtmlFiles(frontendPath))) {
        log.info("WARNING: No .html files found in the publish folder");
    } else if (!(await directoryContainsIndexHtmlFiles(frontendPath))) {
        // check if there is no index.html file in the publish folder
        log.info("WARNING: No index.html file found in the publish folder");
    }

    if (!options.subdomain && !frontend.subdomain) {
        log.info(
            "No subdomain specified in the genezio.yaml configuration file or as an option flag. We will provide a random one for you.",
        );

        // write the configuration in yaml file
        const yamlConfigIOController = new YamlConfigurationIOController(options.config);
        const yamlConfig = await yamlConfigIOController.read(/* fillDefaults= */ false);

        if (yamlConfig.frontend) {
            const subdomain = generateRandomSubdomain();

            if (Array.isArray(yamlConfig.frontend)) {
                yamlConfig.frontend[index].subdomain = subdomain;
            } else {
                yamlConfig.frontend.subdomain = subdomain;
            }

            frontend.subdomain = subdomain;
        } else {
            throw new UserError("No frontend entry in genezio configuration file.");
        }

        await configIOController.write(yamlConfig);
    }

    frontend.subdomain = options.subdomain || frontend.subdomain;

    const cloudAdapter = getCloudAdapter(CloudProviderIdentifier.GENEZIO_CLOUD);
    const url = await cloudAdapter.deployFrontend(name, region, frontend, stage);
    return url;
}

async function handleSdk(
    configuration: YamlProjectConfiguration,
    result: GenezioCloudOutput,
    sdk: SdkHandlerResponse,
    options: GenezioDeployOptions,
) {
    const frontends = configuration.frontend;

    const sdkLocations: Array<{ path: string; language: Language }> = [];

    for (const frontend of frontends || []) {
        if (frontend.sdk) {
            sdkLocations.push({
                path: path.join(frontend.path, frontend.sdk.path || "sdk"),
                language: frontend.sdk.language,
            });
        }
    }

    const linkedFrontends = await getLinkedFrontendsForProject(configuration.name);
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

        const classUrls = result.classes.map((c) => ({
            name: c.className,
            cloudUrl: c.functionUrl,
        }));
        await writeSdk({
            language: sdkLocation.language,
            packageName: `@genezio-sdk/${configuration.name}`,
            packageVersion: `1.0.0-${options.stage}`,
            sdkResponse,
            classUrls,
            publish: true,
            installPackage: true,
            outputPath: sdkLocation.path,
        });

        reportSuccessForSdk(sdkLocation.language, sdkResponse, GenezioCommand.deploy, {
            name: configuration.name,
            stage: options.stage || "prod",
        });
    }
}

export function getCloudAdapter(provider: CloudProviderIdentifier): CloudAdapter {
    switch (provider) {
        case CloudProviderIdentifier.GENEZIO_AWS:
        case CloudProviderIdentifier.GENEZIO_UNIKERNEL:
            return new GenezioCloudAdapter();
        case CloudProviderIdentifier.GENEZIO_CLOUD:
            return new GenezioCloudAdapter();
        case CloudProviderIdentifier.GENEZIO_CLUSTER:
            return new ClusterCloudAdapter();
        default:
            throw new UserError(`Unsupported cloud provider: ${provider}`);
    }
}
