import path from "path";
import { deployRequest } from "./requests/deployCode";
import generateSdkRequest from "./requests/generateSdk";
import listProjects from "./requests/listProjects";
import deleteProject from "./requests/deleteProject";
import {
  createTemporaryFolder,
  fileExists,
  writeToFile,
  zipDirectory,
  zipDirectoryToDestinationPath
} from "./utils/file";
import { askQuestion } from "./utils/prompt";
import { Document } from "yaml";
import {
  TriggerType, Language,
} from "./models/yamlProjectConfiguration";
import { getProjectConfiguration } from "./utils/configuration";
import { printAdaptiveLog } from "./utils/logging";
import { REACT_APP_BASE_URL, FRONTEND_DOMAIN } from "./variables";
import log from "loglevel";
import http from "http";
import jsonBody from "body/json";
import { exit } from "process";
import { AddressInfo } from "net";
import open from "open";
import { NodeJsBundler } from "./bundlers/javascript/nodeJsBundler";
import { NodeTsBundler } from "./bundlers/typescript/nodeTsBundler";
import { NodeJsBinaryDependenciesBundler } from "./bundlers/javascript/nodeJsBinaryDependenciesBundler";
import { NodeTsBinaryDependenciesBundler } from "./bundlers/typescript/nodeTsBinaryDependenciesBundler";
import { languages } from "./utils/languages";
import { saveAuthToken } from "./utils/accounts";
import { getPresignedURL } from "./requests/getPresignedURL";
import { uploadContentToS3 } from "./requests/uploadContentToS3";
import moment from "moment";
import { Spinner } from "cli-spinner";
import { debugLogger } from "./utils/logging";
import { BundlerComposer } from "./bundlers/bundlerComposer";
import { BundlerInterface } from "./bundlers/bundler.interface";
import { ProjectConfiguration } from "./models/projectConfiguration";
import { ClassUrlMap, replaceUrlsInSdk, writeSdkToDisk } from "./utils/sdk";
import { GenerateSdkResponse } from "./models/generateSdkResponse"
import { getFrontendPresignedURL } from "./requests/getFrontendPresignedURL";
import getProjectInfo from "./requests/getProjectInfo";
import { generateRandomSubdomain } from "./utils/yaml";
import { regions } from "./utils/configs";
import { GENEZIO_YAML_COMMENT } from "./utils/strings";


export async function addNewClass(classPath: string, classType: string) {
  if (classType === undefined) {
    classType = "jsonrpc";
  } else if (!["http", "jsonrpc"].includes(classType)) {
    throw new Error(
      "Invalid class type. Valid class types are 'http' and 'jsonrpc'."
    );
  }

  if (classPath === undefined || classPath === "") {
    log.error("Please provide a path to the class you want to add.");
    return;
  }

  const projectConfiguration = await getProjectConfiguration();

  const className = classPath.split(path.sep).pop();

  if (!className) {
    log.error("Invalid class path.");
    return;
  }

  const classExtension = className.split(".").pop();
  if (!classExtension || className.split(".").length < 2) {
    log.error("Invalid class extension.");
    return;
  }

  // check if class already exists
  if (projectConfiguration.classes.length > 0) {
    if (
      projectConfiguration.classes
        .map((c) => c.path.split(path.sep).pop())
        .includes(className)
    ) {
      log.error("Class already exists.");
      return;
    }
  }

  // create the file if it does not exist
  if (!(await fileExists(classPath))) {
    await writeToFile(".", classPath, "", true).catch((error) => {
      log.error(error.toString());
      throw error;
    });
  }

  projectConfiguration.addClass(classPath, classType as TriggerType, []);
  await projectConfiguration.writeToFile();

  log.info("\x1b[36m%s\x1b[0m", "Class added successfully.");
}

export async function lsHandler(identifier: string, l: boolean) {
  // show prompt if no project id is selected
  const spinner = new Spinner("%s  ");
  spinner.setSpinnerString("|/-\\");
  spinner.start();
  let projectsJson = await listProjects();
  spinner.stop();
  log.info("");
  if (projectsJson.length == 0) {
    log.info("There are no currently deployed projects.");
    return;
  }
  if (identifier.trim().length !== 0) {
    projectsJson = projectsJson.filter(
      (project) => project.name === identifier || project.id === identifier
    );
    if (projectsJson.length == 0) {
      log.info("There is no project with this identifier.");
      return;
    }
  }
  projectsJson.forEach(function (project: any, index: any) {
    if (l) {
      log.info(
        `[${1 + index}]: Project name: ${project.name},\n\tRegion: ${project.region
        },\n\tID: ${project.id},\n\tCreated: ${moment
          .unix(project.createdAt)
          .format()},\n\tUpdated: ${moment.unix(project.updatedAt).format()}`
      );
    } else {
      log.info(
        `[${1 + index}]: Project name: ${project.name}, Region: ${project.region
        }, Updated: ${moment.unix(project.updatedAt).format()}`
      );
    }
  });
}

export async function deleteProjectHandler(projectId: string, forced: boolean) {
  // show prompt if no project id is selected
  if (typeof projectId === "string" && projectId.trim().length === 0) {
    const spinner = new Spinner("%s  ");
    spinner.setSpinnerString("|/-\\");
    spinner.start();
    const projectsJson = await listProjects();
    spinner.stop();
    // hack to add a newline  after the spinner
    log.info("");

    const projects = projectsJson.map(function (project: any, index: any) {
      return `[${1 + index}]: Project name: ${project.name}, Region: ${project.region}, ID: ${project.id}`;
    })

    if (projects.length === 0) {
      log.info("There are no currently deployed projects.");
      return false;
    } else {
      log.info(
        "No project ID specified, select an ID to delete from this list:"
      );
      log.info(projects);
    }

    const selection = await askQuestion(
      `Please select project number to delete (1--${projects.length}) [none]: `,
      ""
    );
    const selectionNum = Number(selection);
    if (
      isNaN(selectionNum) ||
      selectionNum <= 0 ||
      selectionNum > projects.length
    ) {
      log.info("No valid selection was made, aborting.");
      return false;
    } else {
      forced = false;
      // get the project id from the selection
      projectId = projects[selectionNum - 1].split(":")[4].trim();
    }
  }

  if (!forced) {
    const confirmation = await askQuestion(
      `Are you sure you want to delete project ${projectId}? y/[N]: `,
      "n"
    );

    if (confirmation !== "y" && confirmation !== "Y") {
      log.warn("Aborted operation.");
      return false;
    }
  }

  const status = await deleteProject(projectId);
  return status;
}

export async function deployClasses() {
  const configuration = await getProjectConfiguration();

  if (configuration.classes.length === 0) {
    throw new Error(
      "You don't have any class in specified in the genezio.yaml configuration file. Add a class with 'genezio addClass <className> <classType>' field and then call again 'genezio deploy'."
    );
  }

  log.info("Deploying your backend project to genezio infrastructure...");

  const sdkResponse = await generateSdkRequest(configuration).catch((error) => {
    throw error;
  });
  const projectConfiguration = new ProjectConfiguration(configuration, sdkResponse.astSummary);

  printAdaptiveLog("Bundling your code and uploading it", "start");
  const promisesDeploy: any = projectConfiguration.classes.map(
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

      const resultPresignedUrl = await getPresignedURL(
        configuration.region,
        "genezioDeploy.zip",
        configuration.name,
        element.name
      )

      debugLogger.debug(`Upload the content to S3 for file ${element.path}.`)
      await uploadContentToS3(resultPresignedUrl.presignedURL, archivePath)
      debugLogger.debug(`Done uploading the content to S3 for file ${element.path}.`)
    }
  );

  // wait for all promises to finish
  await Promise.all(promisesDeploy);
  printAdaptiveLog("Bundling your code and uploading it", "end");

  const response = await deployRequest(projectConfiguration)

  const classesInfo = response.classes.map((c) => ({
    className: c.name,
    methods: c.methods,
    functionUrl: c.cloudUrl,
    projectId: response.projectId
  }));

  reportSuccess(classesInfo, sdkResponse);

  await replaceUrlsInSdk(sdkResponse, response.classes)
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
    await uploadContentToS3(result.presignedURL, archivePath, result.userId)
    debugLogger.debug("Uploaded to S3.")
  } else {
    throw new Error("No frontend entry in genezio configuration file.")
  }

  return `https://${configuration.frontend.subdomain}.${FRONTEND_DOMAIN}`
}

export function reportSuccess(
  classesInfo: any,
  sdkResponse: GenerateSdkResponse,
) {
  if (sdkResponse.classFiles.length > 0) {
    log.info(
      "\x1b[36m%s\x1b[0m",
      "Your code was deployed and the SDK was successfully generated!"
    );
  } else {
    log.info(
      "\x1b[36m%s\x1b[0m",
      "Your code was successfully deployed!"
    );
  }

  // print function urls
  let printHttpString = "";

  classesInfo.forEach((classInfo: any) => {
    classInfo.methods.forEach((method: any) => {
      if (method.type === TriggerType.http) {
        printHttpString +=
          `  - ${classInfo.className}.${method.name}: ${classInfo.functionUrl}${classInfo.className}/${method.name}` +
          "\n";
      }
    });
  });

  if (printHttpString !== "") {
    log.info("");
    log.info("HTTP Methods Deployed:");
    log.info(printHttpString);
  }
}

export async function init() {
  let projectName = "";
  while (projectName.length === 0) {
    projectName = await askQuestion(`What is the name of the project: `);
    if (projectName.length === 0) {
      log.error("The project name can't be empty.");
    }
  }
  const configFile: any = {
    name: projectName,
    region: "",
    sdk: { options: {} },
    classes: []
  };

  const region = await askQuestion(
    `What region do you want to deploy your project to? [default value: us-east-1]: `,
    "us-east-1"
  );

  if (!regions.includes(region)) {
    throw Error(
      `The region is invalid. Please use a valid region.\n Region list: ${regions}`
    )
  }
  configFile.region = region;

  const sdkLanguage = await askQuestion(
    `In what programming language do you want your SDK? (js, ts, swift or python) [default value: js]: `,
    "js"
  );

  if (!languages.includes(sdkLanguage)) {
    throw Error(
      `We don't currently support the ${sdkLanguage} language. You can open an issue ticket at https://github.com/Genez-io/genezio/issues.`
    );
  }
  configFile.sdk.language = sdkLanguage;

  if (sdkLanguage === "js" || sdkLanguage === "ts") {
    const runtime = await askQuestion(
      `What runtime will you use? Options: "node" or "browser". [default value: node]: `,
      "node"
    );
    if (runtime !== "node" && runtime !== "browser") {
      throw Error(`We don't currently support this JS/TS runtime ${runtime}.`);
    }

    configFile.sdk.options.runtime = runtime;
  }

  const path = await askQuestion(
    `Where do you want to save your SDK? [default value: ./sdk/]: `,
    "./sdk/"
  );
  configFile.sdk.path = path;

  const doc = new Document(configFile);
  doc.commentBefore = GENEZIO_YAML_COMMENT

  const yamlConfigurationFileContent = doc.toString();

  await writeToFile(".", "genezio.yaml", yamlConfigurationFileContent).catch(
    (error) => {
      log.error(error.toString());
    }
  );

  log.info("");
  log.info(
    "\x1b[36m%s\x1b[0m",
    "Your genezio project was successfully initialized!"
  );
  log.info("");
  log.info(
    "The genezio.yaml configuration file was generated. You can now add the classes that you want to deploy using the 'genezio addClass <className> <classType>' command."
  );
  log.info("");
}

export async function handleLogin(accessToken: string) {
  if (accessToken !== "") {
    saveAuthToken(accessToken);
  } else {
    const server = http.createServer((req, res) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      res.setHeader("Access-Control-Allow-Methods", "POST");
      res.setHeader("Access-Control-Allow-Credentials", "true");
      if (req.method === "OPTIONS") {
        res.end();
        return;
      }
      jsonBody(req, res, (err, body: any) => {
        const params = new URLSearchParams(req.url);

        const token = params.get("/?token")!;

        saveAuthToken(token).then(() => {
          log.info(`Welcome! You can now start using genezio.`);
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.setHeader("Access-Control-Allow-Headers", "Content-Type");
          res.setHeader("Access-Control-Allow-Methods", "POST");
          res.setHeader("Access-Control-Allow-Credentials", "true");
          res.writeHead(301, {
            Location: `${REACT_APP_BASE_URL}/cli/login/success`
          });
          res.end();

          exit(0);
        });
      });
    });

    const promise = new Promise((resolve) => {
      server.listen(0, "localhost", () => {
        log.info("Redirecting to browser to complete authentication...");
        const address = server.address() as AddressInfo;
        resolve(address.port);
      });
    });

    const port = await promise;
    const browserUrl = `${REACT_APP_BASE_URL}/cli/login?redirect_url=http://localhost:${port}/`;
    open(browserUrl);
  }
}


export async function generateSdkHandler(language: string, path: string) {
  const configuration = await getProjectConfiguration();


  configuration.sdk.language = language as Language;
  configuration.sdk.path = path;

  if (configuration.classes.length === 0) {
    throw new Error(
      "You don't have any class in specified in the genezio.yaml configuration file. Add a class with 'genezio addClass <className> <classType>'."
    );
  }

  const sdkResponse = await generateSdkRequest(configuration).catch((error) => {
    throw error;
  });

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

  completeProjectInfo.classes.forEach((classInfo: any) => {
    classUrlMap.push({
      name: classInfo.name,
      cloudUrl: classInfo.cloudUrl
    });
  });


  await replaceUrlsInSdk(sdkResponse, classUrlMap)
  await writeSdkToDisk(sdkResponse, configuration.sdk.language, configuration.sdk.path)
}
