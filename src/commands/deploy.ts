import { AxiosError } from "axios";
import log from "loglevel";
import path from "path";
import { exit } from "process";
import { BundlerInterface } from "../bundlers/bundler.interface";
import { BundlerComposer } from "../bundlers/bundlerComposer";
import { NodeJsBinaryDependenciesBundler } from "../bundlers/javascript/nodeJsBinaryDependenciesBundler";
import { NodeJsBundler } from "../bundlers/javascript/nodeJsBundler";
import { NodeTsBinaryDependenciesBundler } from "../bundlers/typescript/nodeTsBinaryDependenciesBundler";
import { NodeTsBundler } from "../bundlers/typescript/nodeTsBundler";
import { REACT_APP_BASE_URL, FRONTEND_DOMAIN } from "../constants";
import { GENEZIO_NOT_AUTH_ERROR_MSG } from "../errors";
import { sdkGeneratorApiHandler } from "../generateSdk/generateSdkApi";
import { ProjectConfiguration } from "../models/projectConfiguration";
import { SdkGeneratorResponse } from "../models/sdkGeneratorResponse";
import { deployRequest } from "../requests/deployCode";
import { getFrontendPresignedURL } from "../requests/getFrontendPresignedURL";
import { getPresignedURL } from "../requests/getPresignedURL";
import { uploadContentToS3 } from "../requests/uploadContentToS3";
import { getAuthToken } from "../utils/accounts";
import { getProjectConfiguration } from "../utils/configuration";
import { fileExists, createTemporaryFolder, zipDirectory, zipDirectoryToDestinationPath } from "../utils/file";
import { printAdaptiveLog, debugLogger } from "../utils/logging";
import { runNewProcess } from "../utils/process";
import { reportSuccess } from "../utils/reporter";
import { replaceUrlsInSdk, writeSdkToDisk } from "../utils/sdk";
import { generateRandomSubdomain } from "../utils/yaml";
import cliProgress from 'cli-progress';


export async function deployCommand(options: any) {
  // check if user is logged in
  const authToken = await getAuthToken();
  if (!authToken) {
    log.error(GENEZIO_NOT_AUTH_ERROR_MSG);
    exit(1);
  }

  const configuration = await getProjectConfiguration();

  if (!options.frontend || options.backend) {
    if (configuration.scripts?.preBackendDeploy) {
      log.info("Running preBackendDeploy script...");
      log.info(configuration.scripts?.preBackendDeploy);
      const output = await runNewProcess(configuration.scripts?.preBackendDeploy);
      if (!output) {
        log.error("preBackendDeploy script failed.");
        exit(1);
      }
    }

    await deployClasses()
      .catch((error: AxiosError) => {
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
      });

    if (configuration.scripts?.postBackendDeploy) {
      log.info("Running postBackendDeploy script...");
      log.info(configuration.scripts?.postBackendDeploy);
      const output = await runNewProcess(configuration.scripts?.postBackendDeploy);
      if (!output) {
        log.error("postBackendDeploy script failed.");
        exit(1);
      }
    }
  }

  if (!options.backend || options.frontend) {
    if (configuration.scripts?.preFrontendDeploy) {
      log.info("Running preFrontendDeploy script...");
      log.info(configuration.scripts?.preFrontendDeploy);
      const output = await runNewProcess(configuration.scripts?.preFrontendDeploy);
      if (!output) {
        log.error("preFrontendDeploy script failed.");
        exit(1);
      }
    }

    log.info("Deploying your frontend to genezio infrastructure...");
    let url;
    try {
      url = await deployFrontend()
    } catch(error: any) {
      log.error(error.message);
      if (error.message == "No frontend entry in genezio configuration file.") {
        exit(0);
      }
      exit(1);
    }
    log.info(
      "\x1b[36m%s\x1b[0m",
      `Frontend successfully deployed at ${url}.`);
    
    if (configuration.scripts?.postFrontendDeploy) {
      log.info("Running postFrontendDeploy script...");
      log.info(configuration.scripts?.postFrontendDeploy);
      const output = await runNewProcess(configuration.scripts?.postFrontendDeploy);
      if (!output) {
        log.error("postFrontendDeploy script failed.");
        exit(1);
      }
    }
  }
}



export async function deployClasses() {
  const configuration = await getProjectConfiguration();

  if (configuration.classes.length === 0) {
    throw new Error(
      "You don't have any class in specified in the genezio.yaml configuration file. Add a class with 'genezio addClass <className> <classType>' field and then call again 'genezio deploy'."
    );
  }

  log.info("Deploying your backend project to genezio infrastructure...");

  const sdkResponse: SdkGeneratorResponse = await sdkGeneratorApiHandler(configuration).catch((error) => {
    // TODO: this is not very generic error handling. The SDK should throw Genezio errors, not babel.
    if (error.code === "BABEL_PARSER_SYNTAX_ERROR") {
      log.error("Syntax error:");
      log.error(`Reason Code: ${error.reasonCode}`)
      log.error(`File: ${error.path}:${error.loc.line}:${error.loc.column}`);

      throw error;
    }

    throw error;
  })
  const projectConfiguration = new ProjectConfiguration(configuration, sdkResponse.astSummary);

  const multibar = new cliProgress.MultiBar({
    clearOnComplete: false,
    hideCursor: true,
    format: 'Uploading {filename}: {bar} | {value}% | {eta_formatted}',
}, cliProgress.Presets.shades_grey);

  printAdaptiveLog("Bundling your code", "start");
  const bundlerResult: any = projectConfiguration.classes.map(
    async (element) => {
      if (!(await fileExists(element.path))) {
        printAdaptiveLog("Bundling your code and uploading it", "error");
        log.error(
          `\`${element.path}\` file does not exist at the indicated path.`
        );
        exit(1);
      }

      let bundler: BundlerInterface;
      switch (element.language) {
        case ".ts": {
          const standardBundler = new NodeTsBundler();
          const binaryDepBundler = new NodeTsBinaryDependenciesBundler();
          bundler = new BundlerComposer([standardBundler, binaryDepBundler]);
          break;
        }
        case ".js": {
          const standardBundler = new NodeJsBundler();
          const binaryDepBundler = new NodeJsBinaryDependenciesBundler();
          bundler = new BundlerComposer([standardBundler, binaryDepBundler]);
          break;
        }
        default:
          log.error(`Unsupported ${element.language}`);
          return Promise.resolve();
      }

      debugLogger.debug(
        `The bundling process has started for file ${element.path}...`
      );
      const output = await bundler.bundle({
        configuration: element,
        path: element.path,
        extra: {
          mode: "production"
        }
      });
      debugLogger.debug(
        `The bundling process finished successfully for file ${element.path}.`
      );

      const archivePath = path.join(
        await createTemporaryFolder("genezio-"),
        `genezioDeploy.zip`
      );

      debugLogger.debug(`Zip the directory ${output.path}.`);
      await zipDirectory(output.path, archivePath);
      debugLogger.debug(`Get the presigned URL for class name ${element.name}.`)

      return { name: element.name, archivePath: archivePath, path: element.path };
    }); 

    const bundlerResultArray = await Promise.all(bundlerResult);

    printAdaptiveLog("Bundling your code", "end");

    const promisesDeploy = bundlerResultArray.map(async (element) => {
      const resultPresignedUrl = await getPresignedURL(
        configuration.region,
        "genezioDeploy.zip",
        configuration.name,
        element.name
      )

      const bar = multibar.create(100, 0, { filename: element.name });
      debugLogger.debug(`Upload the content to S3 for file ${element.path}.`)
      await uploadContentToS3(resultPresignedUrl.presignedURL, element.archivePath, (percentage) => {
        bar.update(parseFloat((percentage * 100).toFixed(2)), {filename: element.name});

        if (percentage == 1) {
          bar.stop();
        }
      })

      debugLogger.debug(`Done uploading the content to S3 for file ${element.path}.`)
    }
  );

  // wait for all promises to finish
  await Promise.all(promisesDeploy);
  multibar.stop()
  // The loading spinner is removing lines and with this we avoid clearing a progress bar.
  // This can be removed only if we find a way to avoid clearing lines.
  log.info("")

  const response = await deployRequest(projectConfiguration)

  const classesInfo = response.classes.map((c) => ({
    className: c.name,
    methods: c.methods,
    functionUrl: c.cloudUrl,
    projectId: response.projectId
  }));

  reportSuccess(classesInfo, sdkResponse);

  await replaceUrlsInSdk(sdkResponse, response.classes.map((c) => ({
    name: c.name,
    cloudUrl: c.cloudUrl
  })));
  await writeSdkToDisk(sdkResponse, configuration.sdk.language, configuration.sdk.path)

  const projectId = classesInfo[0].projectId;
  console.log(
    `Your backend project has been deployed and is available at ${REACT_APP_BASE_URL}/project/${projectId}`
  );
}

export async function deployFrontend(): Promise<string> {
  const configuration = await getProjectConfiguration();

  if (configuration.frontend) {
    if (!configuration.frontend.subdomain) {
      log.info("No subdomain specified in the genezio.yaml configuration file. We will provide a random one for you.")
      configuration.frontend.subdomain = generateRandomSubdomain()

      // write the configuration in yaml file
      await configuration.addSubdomain(configuration.frontend.subdomain)
    }


    debugLogger.debug("Getting presigned URL...")
    const result = await getFrontendPresignedURL(configuration.frontend.subdomain, configuration.name)

    if (!result.presignedURL) {
      throw new Error("An error occured (missing presignedUrl). Please try again!")
    }

    if (!result.userId) {
      throw new Error("An error occured (missing userId). Please try again!")
    }

    const archivePath = path.join(
      await createTemporaryFolder("genezio-"),
      `${configuration.frontend.subdomain}.zip`
    );
    debugLogger.debug("Creating temporary folder", archivePath)

    await zipDirectoryToDestinationPath(configuration.frontend.path, configuration.frontend.subdomain, archivePath)
    debugLogger.debug("Content of the folder zipped. Uploading to S3.")
    await uploadContentToS3(result.presignedURL, archivePath, undefined, result.userId)
    debugLogger.debug("Uploaded to S3.")
  } else {
    throw new Error("No frontend entry in genezio configuration file.")
  }

  return `https://${configuration.frontend.subdomain}.${FRONTEND_DOMAIN}`
}