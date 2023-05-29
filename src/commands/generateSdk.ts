import { AxiosError } from "axios";
import log from "loglevel";
import { exit } from "process";
import { languages } from "../utils/languages";
import {
  GENEZIO_NOT_AUTH_ERROR_MSG,
  GENEZIO_NO_CLASSES_FOUND
} from "../errors";
import { sdkGeneratorApiHandler } from "../generateSdk/generateSdkApi";
import { Language } from "../models/yamlProjectConfiguration";
import getProjectInfo from "../requests/getProjectInfo";
import listProjects from "../requests/listProjects";
import { getAuthToken } from "../utils/accounts";
import { getProjectConfiguration } from "../utils/configuration";
import { ClassUrlMap, replaceUrlsInSdk, writeSdkToDisk } from "../utils/sdk";

export async function generateSdkCommand(options: any) {
  const language = options.language;
  const sdkPath = options.path;

  if (!language) {
    log.error(
      `Please specify a language for the SDK to generate using --language <language>. Please use one of the following: ${languages}.`
    );
    exit(1);
  }

  // check if language is supported using languages array
  if (!languages.includes(language)) {
    log.error(
      `The language you specified is not supported. Please use one of the following: ${languages}.`
    );
    exit(1);
  }

  // check if path is specified
  if (!sdkPath) {
    log.error(
      "Please specify a path for the SDK to generate using --path <path>."
    );
    exit(1);
  }

  await generateSdkHandler(language, sdkPath).catch((error: AxiosError) => {
    if (error.response?.status == 401) {
      log.error(GENEZIO_NOT_AUTH_ERROR_MSG);
    } else {
      log.error(error.message);
    }
    exit(1);
  });

  console.log("Your SDK has been generated successfully in " + sdkPath + "");
}

async function generateSdkHandler(language: string, path: string) {
  const configuration = await getProjectConfiguration();

  configuration.sdk.language = language as Language;
  configuration.sdk.path = path;

  // check if there are classes in the configuration
  if (configuration.classes.length === 0) {
    throw new Error(GENEZIO_NO_CLASSES_FOUND);
  }

  // get the sdk from the sdk generator api
  const sdkResponse = await sdkGeneratorApiHandler(configuration).catch(
    (error) => {
      throw error;
    }
  );

  // get all project classes
  const projects = await listProjects(0).catch((error: any) => {
    throw error;
  });

  // check if the project exists with the configuration project name, region
  const project = projects.find(
    (project: any) =>
      project.name === configuration.name &&
      project.region === configuration.region
  );

  // if the project doesn't exist, throw an error
  if (!project) {
    throw new Error(
      `The project ${configuration.name} doesn't exist in the region ${configuration.region}. You must deploy it first with 'genezio deploy'.`
    );
  }

  // get project info
  const completeProjectInfo = await getProjectInfo(project.id).catch(
    (error: any) => {
      throw error;
    }
  );

  const classUrlMap: ClassUrlMap[] = [];

  // populate a map of class name and cloud url
  completeProjectInfo.classes.forEach((classInfo: any) => {
    classUrlMap.push({
      name: classInfo.name,
      cloudUrl: classInfo.cloudUrl
    });
  });

  // replace the placeholder urls in the sdk with the actual cloud urls
  await replaceUrlsInSdk(sdkResponse, classUrlMap);

  // write the sdk to disk in the specified path
  await writeSdkToDisk(
    sdkResponse,
    configuration.sdk.language,
    configuration.sdk.path
  );
}
