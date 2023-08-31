import { AxiosError } from "axios";
import log from "loglevel";
import { exit } from "process";
import { languages } from "../utils/languages.js";
import {
  GENEZIO_NOT_AUTH_ERROR_MSG,
  GENEZIO_NO_CLASSES_FOUND,
} from "../errors.js";
import { sdkGeneratorApiHandler } from "../generateSdk/generateSdkApi.js";
import { BackendConfigurationRequired, Language, TriggerType } from "../models/yamlProjectConfiguration.js";
import getProjectInfo from "../requests/getProjectInfo.js";
import listProjects from "../requests/listProjects.js";
import { getProjectConfiguration } from "../utils/configuration.js";
import { ClassUrlMap, replaceUrlsInSdk, writeSdkToDisk } from "../utils/sdk.js";
import { GenezioTelemetry, TelemetryEventTypes } from "../telemetry/telemetry.js";
import path from "path";
import {
  SdkGeneratorClassesInfoInput,
  SdkGeneratorInput,
} from "../models/genezioModels.js";
import { AstSummaryClassResponse } from "../models/astSummary.js";
import { mapDbAstToSdkGeneratorAst } from "../generateSdk/utils/mapDbAstToFullAst.js";
import { generateSdk } from "../generateSdk/sdkGeneratorHandler.js";
import { SdkGeneratorResponse } from "../models/sdkGeneratorResponse.js";

export async function generateSdkCommand(projectName: string, options: any) {
  const language = options.language;
  const sdkPath = options.path;
  const stage = options.stage;
  const region = options.region;

  // check if language is supported using languages array
  if (!languages.includes(language)) {
    log.error(
      `The language you specified is not supported. Please use one of the following: ${languages}.`
    );
    exit(1);
  }

  if (projectName) {
    GenezioTelemetry.sendEvent({ eventType: TelemetryEventTypes.GENEZIO_GENERATE_REMOTE_SDK , commandOptions: JSON.stringify(options)});
    await generateRemoteSdkHandler(
      language,
      sdkPath,
      projectName,
      stage,
      region
    ).catch((error: AxiosError) => {
      if (error.response?.status == 401) {
        log.error(GENEZIO_NOT_AUTH_ERROR_MSG);
      } else {
        GenezioTelemetry.sendEvent({ eventType: TelemetryEventTypes.GENEZIO_GENERATE_SDK_REMOTE_ERROR, errorTrace: error.message, commandOptions: JSON.stringify(options)});
        log.error(error.message);
      }
      exit(1);
    });
  } else {
    GenezioTelemetry.sendEvent({ eventType: TelemetryEventTypes.GENEZIO_GENERATE_LOCAL_SDK, commandOptions: JSON.stringify(options)});
    let source = options.source;
    // check if path ends in .genezio.yaml or else append it
    if (!source.endsWith("genezio.yaml")) {
      source = path.join(source, "genezio.yaml");
    }
    const port = options.port;
    if (port && isNaN(parseInt(port))) {
      log.error("Please specify a valid port number using --port <port>.");
      exit(1);
    }
    const portNumber = port ? parseInt(port) : 8083;
    await generateLocalSdkHandler(language, source, sdkPath, portNumber).catch(
      (error: Error) => {
        GenezioTelemetry.sendEvent({ eventType: TelemetryEventTypes.GENEZIO_GENERATE_SDK_LOCAL_ERROR, errorTrace: error.message, commandOptions: JSON.stringify(options)});
        log.error(error.message);
        exit(1);
      }
    );
  }

  console.log("Your SDK has been generated successfully in " + sdkPath + "");
}

async function generateLocalSdkHandler(
  language: string,
  source: string,
  sdkPath: string,
  port: number
) {
  const configuration = await getProjectConfiguration(BackendConfigurationRequired.BACKEND_REQUIRED, source);

  configuration.sdk!.language = language as Language;
  configuration.sdk!.path = sdkPath;

  // check if there are classes in the configuration
  if (configuration.classes.length === 0) {
    throw new Error(GENEZIO_NO_CLASSES_FOUND);
  }

  // get the sdk from the sdk generator api
  // temporarily move working directory to the project directory
  const cwd = process.cwd();
  const configurationDirectory = path.dirname(source);
  process.chdir(configurationDirectory);
  const sdkResponse = await sdkGeneratorApiHandler(configuration).catch(
    (error) => {
      throw error;
    }
  );
  process.chdir(cwd);

  // replace the placeholder urls in the sdk with the actual cloud urls
  await replaceUrlsInSdk(
    sdkResponse,
    sdkResponse.files.map((c) => ({
      name: c.className,
      cloudUrl: `http://127.0.0.1:${port}/${c.className}`,
    }))
  );
  // write the sdk to disk in the specified path
  await writeSdkToDisk(
    sdkResponse,
    configuration.sdk!.language,
    configuration.sdk!.path
  );
}

async function generateRemoteSdkHandler(
  language: string,
  sdkPath: string,
  projectName: string,
  stage: string,
  region: string
) {
  // get all project classes
  const projects = await listProjects(0).catch((error: any) => {
    throw error;
  });

  // check if the project exists with the configuration project name, region
  const project = projects.find(
    (project: any) =>
      project.name === projectName &&
      project.region === region &&
      project.stage === stage
  );

  // if the project doesn't exist, throw an error
  if (!project) {
    throw new Error(
      `The project ${projectName} on stage ${stage} doesn't exist in the region ${region}. You must deploy it first with 'genezio deploy'.`
    );
  }

  // get project info
  const completeProjectInfo = await getProjectInfo(project.id).catch(
    (error: any) => {
      throw error;
    }
  );

  const sdkGeneratorInput: SdkGeneratorInput = {
    classesInfo: completeProjectInfo.classes.map(
      (c: any): SdkGeneratorClassesInfoInput => ({
        program: mapDbAstToSdkGeneratorAst(c.ast as AstSummaryClassResponse),
        classConfiguration: {
          path: c.ast.path,
          type: TriggerType.jsonrpc,
          methods: [],
          language: path.extname(c.ast.path),
          getMethodType: () => TriggerType.jsonrpc,
        },
        fileName: path.basename(c.ast.path),
      })
    ),
    sdk: {
      language: language as Language,
    },
  };

  const sdkGeneratorOutput = await generateSdk(
    sdkGeneratorInput,
    undefined
  ).catch((error: any) => {
    throw error;
  });

  const sdkGeneratorResponse: SdkGeneratorResponse = {
    files: sdkGeneratorOutput.files,
    sdkGeneratorInput: sdkGeneratorInput,
  };

  // replace the placeholder urls in the sdk with the actual cloud urls
  const classUrlMap: ClassUrlMap[] = [];

  // populate a map of class name and cloud url
  completeProjectInfo.classes.forEach((classInfo: any) => {
    classUrlMap.push({
      name: classInfo.name,
      cloudUrl: classInfo.cloudUrl,
    });
  });

  await replaceUrlsInSdk(sdkGeneratorResponse, classUrlMap);

  // write the sdk to disk in the specified path
  await writeSdkToDisk(sdkGeneratorResponse, language as Language, sdkPath);
}
