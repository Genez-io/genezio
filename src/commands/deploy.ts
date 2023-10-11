import { AxiosError } from "axios";
import log from "loglevel";
import path from "path";
import {  exit } from "process";
import { BundlerInterface } from "../bundlers/bundler.interface.js";
import { BundlerComposer } from "../bundlers/bundlerComposer.js";
import { DartBundler } from "../bundlers/dart/dartBundler.js";
import { NodeJsBinaryDependenciesBundler } from "../bundlers/node/nodeJsBinaryDependenciesBundler.js";
import { NodeJsBundler } from "../bundlers/node/nodeJsBundler.js";
import { REACT_APP_BASE_URL } from "../constants.js";
import { KotlinBundler } from "../bundlers/kotlin/kotlinBundler.js";
import {
  GENEZIO_NOT_AUTH_ERROR_MSG,
  GENEZIO_NO_CLASSES_FOUND,
} from "../errors.js";
import { sdkGeneratorApiHandler } from "../generateSdk/generateSdkApi.js";
import { ProjectConfiguration } from "../models/projectConfiguration.js";
import { SdkGeneratorResponse } from "../models/sdkGeneratorResponse.js";
import { getAuthToken } from "../utils/accounts.js";
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
} from "../utils/file.js";
import { printAdaptiveLog, debugLogger } from "../utils/logging.js";
import { runNewProcess } from "../utils/process.js";
import { reportSuccess } from "../utils/reporter.js";
import { replaceUrlsInSdk, writeSdkToDisk } from "../utils/sdk.js";
import { generateRandomSubdomain } from "../utils/yaml.js";
import cliProgress from "cli-progress";
import {
  YamlProjectConfiguration,
} from "../models/yamlProjectConfiguration.js";
import { GenezioCloudAdapter } from "../cloudAdapter/genezio/genezioAdapter.js";
import { SelfHostedAwsAdapter } from "../cloudAdapter/aws/selfHostedAwsAdapter.js";
import { CloudAdapter } from "../cloudAdapter/cloudAdapter.js";
import { CloudProviderIdentifier } from "../models/cloudProviderIdentifier.js";
import { TypeCheckerBundler } from "../bundlers/node/typeCheckerBundler.js";
import { GenezioDeployOptions } from "../models/commandOptions.js";
import {
  GenezioTelemetry,
  TelemetryEventTypes,
} from "../telemetry/telemetry.js";
import { TsRequiredDepsBundler } from "../bundlers/node/typescriptRequiredDepsBundler.js";
import { setEnvironmentVariables } from "../requests/setEnvironmentVariables.js";
import colors from "colors";
import { getEnvironmentVariables } from "../requests/getEnvironmentVariables.js";
import { getProjectEnvFromProject } from "../requests/getProjectInfo.js";

export async function deployCommand(options: GenezioDeployOptions) {
  let configuration;

  try {
    configuration = await getProjectConfiguration();
  } catch (error: any) {
    log.error(error.message);
    GenezioTelemetry.sendEvent({
      eventType: TelemetryEventTypes.GENEZIO_DEPLOY_ERROR,
      errorTrace: error.toString(),
      commandOptions: JSON.stringify(options),
    });
    exit(1);
  }

  // check if user is logged in
  if (configuration.cloudProvider !== CloudProviderIdentifier.SELF_HOSTED_AWS) {
    const authToken = await getAuthToken();
    if (!authToken) {
      log.error(GENEZIO_NOT_AUTH_ERROR_MSG);
      exit(1);
    }
  }

  const cloudAdapter = getCloudProvider(
    configuration.cloudProvider || CloudProviderIdentifier.AWS
  );

  if (!options.frontend || options.backend) {
    if (configuration.classes.length === 0) {
      log.error(
        "No classes were found in your genezio.yaml. Add some to be able to deploy your backend."
      );
    } else {
      if (configuration.scripts?.preBackendDeploy) {
        log.info("Running preBackendDeploy script...");
        const output = await runNewProcess(
          configuration.scripts?.preBackendDeploy
        );
        if (!output) {
          GenezioTelemetry.sendEvent({
            eventType:
              TelemetryEventTypes.GENEZIO_PRE_BACKEND_DEPLOY_SCRIPT_ERROR,
            commandOptions: JSON.stringify(options),
          });
          log.error("preBackendDeploy script failed.");
          exit(1);
        }
      }

      GenezioTelemetry.sendEvent({
        eventType: TelemetryEventTypes.GENEZIO_BACKEND_DEPLOY_START,
        cloudProvider: configuration.cloudProvider,
        commandOptions: JSON.stringify(options),
      });
      await deployClasses(configuration, cloudAdapter, options).catch(
        async (error: AxiosError) => {
          GenezioTelemetry.sendEvent({
            eventType: TelemetryEventTypes.GENEZIO_BACKEND_DEPLOY_ERROR,
            errorTrace: error.toString(),
            commandOptions: JSON.stringify(options),
          });

          switch (error.response?.status) {
            case 401:
              log.error(GENEZIO_NOT_AUTH_ERROR_MSG);
              break;
            case 500:
              log.error(error.message);
              if (error.response?.data) {
                const data: any = error.response?.data;
                log.error(data.error?.message);
              }
              break;
            case 400:
              log.error(error.message);
              if (error.response?.data) {
                const data: any = error.response?.data;
                log.error(data.error?.message);
              }
              break;
            default:
              if (error.message) {
                log.error(error.message);
              }
              break;
          }
          exit(1);
        }
      );
      GenezioTelemetry.sendEvent({
        eventType: TelemetryEventTypes.GENEZIO_BACKEND_DEPLOY_END,
        cloudProvider: configuration.cloudProvider,
        commandOptions: JSON.stringify(options),
      });

      if (configuration.scripts?.postBackendDeploy) {
        log.info("Running postBackendDeploy script...");
        log.info(configuration.scripts?.postBackendDeploy);
        const output = await runNewProcess(
          configuration.scripts?.postBackendDeploy
        );
        if (!output) {
          GenezioTelemetry.sendEvent({
            eventType:
              TelemetryEventTypes.GENEZIO_POST_BACKEND_DEPLOY_SCRIPT_ERROR,
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
      log.info(configuration.scripts?.preFrontendDeploy);
      const output = await runNewProcess(
        configuration.scripts?.preFrontendDeploy
      );
      if (!output) {
        GenezioTelemetry.sendEvent({
          eventType:
            TelemetryEventTypes.GENEZIO_PRE_FRONTEND_DEPLOY_SCRIPT_ERROR,
          commandOptions: JSON.stringify(options),
        });
        log.error("preFrontendDeploy script failed.");
        exit(1);
      }
    }

    GenezioTelemetry.sendEvent({
      eventType: TelemetryEventTypes.GENEZIO_FRONTEND_DEPLOY_START,
      commandOptions: JSON.stringify(options),
    });

    log.info("Deploying your frontend to genezio infrastructure...");
    let url;
    try {
      url = await deployFrontend(configuration, cloudAdapter, options);
    } catch (error: any) {
      log.error(error.message);
      if (error.message == "No frontend entry in genezio configuration file.") {
        exit(0);
      }
      GenezioTelemetry.sendEvent({
        eventType: TelemetryEventTypes.GENEZIO_FRONTEND_DEPLOY_ERROR,
        errorTrace: error.toString(),
        commandOptions: JSON.stringify(options),
      });
      exit(1);
    }
    log.info("\x1b[36m%s\x1b[0m", `Frontend successfully deployed at ${url}.`);

    GenezioTelemetry.sendEvent({
      eventType: TelemetryEventTypes.GENEZIO_FRONTEND_DEPLOY_END,
      commandOptions: JSON.stringify(options),
    });

    if (configuration.scripts?.postFrontendDeploy) {
      log.info("Running postFrontendDeploy script...");
      log.info(configuration.scripts?.postFrontendDeploy);
      const output = await runNewProcess(
        configuration.scripts?.postFrontendDeploy
      );
      if (!output) {
        GenezioTelemetry.sendEvent({
          eventType:
            TelemetryEventTypes.GENEZIO_POST_FRONTEND_DEPLOY_SCRIPT_ERROR,
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
  options: GenezioDeployOptions
) {
  if (configuration.classes.length === 0) {
    throw new Error(GENEZIO_NO_CLASSES_FOUND);
  }

  // get options
  const installDeps: boolean = options.installDeps || false;
  const stage: string = options.stage || "prod";

  const sdkResponse: SdkGeneratorResponse = await sdkGeneratorApiHandler(
    configuration
  ).catch((error) => {
    // TODO: this is not very generic error handling. The SDK should throw Genezio errors, not babel.
    if (error.code === "BABEL_PARSER_SYNTAX_ERROR") {
      log.error("Syntax error:");
      log.error(`Reason Code: ${error.reasonCode}`);
      log.error(`File: ${error.path}:${error.loc.line}:${error.loc.column}`);

      throw error;
    }

    throw error;
  });
  const projectConfiguration = new ProjectConfiguration(
    configuration,
    sdkResponse
  );

  const classesWithNoMethods = getNoMethodClasses(projectConfiguration.classes);
  if (classesWithNoMethods.length) {
    const errorClasses = classesWithNoMethods.join(", ");
    throw new Error(
      `Unable to deploy classes [${errorClasses}] as they do not have any methods.`
    );
  }

  const multibar = new cliProgress.MultiBar(
    {
      clearOnComplete: false,
      hideCursor: true,
      format: "Uploading {filename}: {bar} | {value}% | {eta_formatted}",
    },
    cliProgress.Presets.shades_grey
  );

  printAdaptiveLog("Bundling your code", "start");
  const bundlerResult = projectConfiguration.classes.map(async (element) => {
    if (!(await fileExists(element.path))) {
      printAdaptiveLog("Bundling your code and uploading it", "error");
      log.error(
        `\`${element.path}\` file does not exist at the indicated path.`
      );

      throw new Error(
        `\`${element.path}\` file does not exist at the indicated path.`
      );
    }

    let bundler: BundlerInterface;

      switch (element.language) {
        case ".ts": {
          const requiredDepsBundler = new TsRequiredDepsBundler();
          const typeCheckerBundler = new TypeCheckerBundler();
          const standardBundler = new NodeJsBundler();
          const binaryDepBundler = new NodeJsBinaryDependenciesBundler();
          bundler = new BundlerComposer([requiredDepsBundler, typeCheckerBundler, standardBundler, binaryDepBundler]);
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
        default:
          log.error(`Unsupported ${element.language}`);
          throw new Error(`Unsupported ${element.language}`);
      }

    debugLogger.debug(
      `The bundling process has started for file ${element.path}...`
    );

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const ast = sdkResponse.sdkGeneratorInput.classesInfo.find(
      (classInfo) => classInfo.classConfiguration.path === element.path
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
      `The bundling process finished successfully for file ${element.path}.`
    );

    // check if the unzipped folder is smaller than 250MB
    const unzippedBundleSize: number = await getBundleFolderSizeLimit(output.path);
    debugLogger.debug(`The unzippedBundleSize for class ${element.path} is ${unzippedBundleSize}.`);

    // .jar files cannot be parsed by AWS Lambda, skip this step for AWS Lambda
    if(element.language === ".kt" && (configuration.cloudProvider === "aws" || configuration.cloudProvider === undefined)) {
      console.debug("Skipping ZIP due to .jar file")
      console.debug(path.join(output.path, "app-standalone.jar"))
      return { name: element.name, archivePath: path.join(output.path, "app-standalone.jar"), filePath: element.path, methods: element.methods, unzippedBundleSize };
    }

    const archivePathTempFolder = await createTemporaryFolder();
    const archivePath = path.join(archivePathTempFolder, `genezioDeploy.zip`);


    debugLogger.debug(`Zip the directory ${output.path}.`);
    await zipDirectory(output.path, archivePath);

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
  });

  const bundlerResultArray = await Promise.all(bundlerResult);

  printAdaptiveLog("Bundling your code", "end");

 const result = await cloudAdapter.deploy(bundlerResultArray as any, projectConfiguration, {
   stage: stage,
 });

  reportSuccess(result.classes, sdkResponse);

  if (configuration.sdk) {
    await replaceUrlsInSdk(
      sdkResponse,
      result.classes.map((c: any) => ({
        name: c.className,
        cloudUrl: c.functionUrl,
      }))
    );
    await writeSdkToDisk(
      sdkResponse,
      configuration.sdk.language,
      configuration.sdk.path
    );
  }

  const projectId = result.classes[0].projectId;
  if (projectId) {
    // Deploy environment variables if --upload-env is true
    if (options.env) {
      const envFile = path.join(process.cwd(), options.env);
      debugLogger.debug(`Loading environment variables from ${envFile}.`);

      if (!(await fileExists(envFile))) {
        // There is no need to exit the process here, as the project has been deployed
        log.error(
          `File ${envFile} does not exists. Please provide the correct path.`
        );
        GenezioTelemetry.sendEvent({
          eventType: TelemetryEventTypes.GENEZIO_DEPLOY_ERROR,
          errorTrace: `File ${envFile} does not exists`,
        });
      } else {
        // Read environment variables from .env file
        const envVars = await readEnvironmentVariablesFile(envFile);
        const projectEnv = await getProjectEnvFromProject(projectId, stage);

        // Upload environment variables to the project
        await setEnvironmentVariables(projectId, projectEnv.id, envVars)
          .then(() => {
            debugLogger.debug(
              `Environment variables from ${envFile} uploaded to project ${projectId}`
            );
            log.info(`The environment variables were uploaded to the project successfully.`);
            GenezioTelemetry.sendEvent({
              eventType: TelemetryEventTypes.GENEZIO_DEPLOY_LOAD_ENV_VARS,
            });
          })
          .catch((error: AxiosError) => {
            log.error(
              `Loading environment variables failed with: ${error.message}`
            );
            log.error(
              `Try to set the environment variables using the dashboard ${colors.cyan(REACT_APP_BASE_URL)}`
            );
            GenezioTelemetry.sendEvent({
              eventType: TelemetryEventTypes.GENEZIO_DEPLOY_ERROR,
              errorTrace: error.toString(),
            });
          });
      }
    } else {
      if (await fileExists(".env")) {
        // read envVars from file
        const envVars = await readEnvironmentVariablesFile(".env");
        const projectEnv = await getProjectEnvFromProject(projectId, stage);

        // get remoteEnvVars from project
        const remoteEnvVars = await getEnvironmentVariables(
          projectId,
          projectEnv.id
        );

        // check if all envVars from file are in remoteEnvVars
        const missingEnvVars = envVars.filter(
          (envVar) =>
            !remoteEnvVars.find((remoteEnvVar) => remoteEnvVar.name === envVar.name)
        );

        // Print missing env vars
        if (missingEnvVars.length > 0) {
          log.info(`${colors.yellow("Warning: The following environment variables are not set on your project: ")}`);
          missingEnvVars.forEach((envVar) => {
            log.info(`${colors.yellow(envVar.name)}`);
          });

          log.info("")
          log.info(`${colors.yellow("Go to the dashboard ")}${colors.cyan(REACT_APP_BASE_URL)} ${colors.yellow("to set your environment variables or run ")} ${colors.cyan("genezio deploy --env .env")}`);
          log.info("")
        }
      }
    }

    console.log(
      `Your backend project has been deployed and is available at ${REACT_APP_BASE_URL}/project/${projectId}`
    );
  }
}

export async function deployFrontend(
  configuration: YamlProjectConfiguration,
  cloudAdapter: CloudAdapter,
  options: GenezioDeployOptions
) {
  const stage: string = options.stage || "";
  if (configuration.frontend) {
    // check if subdomain contains only numbers, letters and hyphens
    if (
      configuration.frontend.subdomain &&
      !configuration.frontend.subdomain.match(/^[a-z0-9-]+$/)
    ) {
      throw new Error(
        `The subdomain can only contain letters, numbers and hyphens.`
      );
    }
    // check if the build folder exists
    if (!(await fileExists(configuration.frontend.path))) {
      throw new Error(
        `The build folder does not exist. Please run the build command first or add a preFrontendDeploy script in the genezio.yaml file.`
      );
    }

    // check if the build folder is empty
    if (await isDirectoryEmpty(configuration.frontend.path)) {
      throw new Error(
        `The build folder is empty. Please run the build command first or add a preFrontendDeploy script in the genezio.yaml file.`
      );
    }

    // check if there are any .html files in the build folder
    if (!(await directoryContainsHtmlFiles(configuration.frontend.path))) {
      log.info("WARNING: No .html files found in the build folder");
    } else if (
      !(await directoryContainsIndexHtmlFiles(configuration.frontend.path))
    ) {
      // check if there is no index.html file in the build folder
      log.info("WARNING: No index.html file found in the build folder");
    }

    if (!configuration.frontend.subdomain) {
      log.info(
        "No subdomain specified in the genezio.yaml configuration file. We will provide a random one for you."
      );
      configuration.frontend.subdomain = generateRandomSubdomain();

      // write the configuration in yaml file
      await configuration.addSubdomain(configuration.frontend.subdomain);
    }

    const url = await cloudAdapter.deployFrontend(
      configuration.name,
      configuration.region,
      configuration.frontend,
      stage
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
    case CloudProviderIdentifier.SELF_HOSTED_AWS:
      return new SelfHostedAwsAdapter();
    default:
      throw new Error(`Unsupported cloud provider: ${provider}`);
  }
}
