import path from "path";
import { deployClass } from "./requests/deployCode";
import generateSdk from "./requests/generateSdk";
import listProjects from "./requests/listProjects";
import deleteProject from "./requests/deleteProject";
import {
  createTemporaryFolder,
  fileExists,
  getFileDetails,
  readUTF8File,
  writeToFile,
  zipDirectory
} from "./utils/file";
import { askQuestion } from "./utils/prompt";
import { parse, Document } from "yaml";
import fs from "fs";
import {
  ProjectConfiguration,
  TriggerType
} from "./models/projectConfiguration";
import { getProjectConfiguration } from "./utils/configuration";
import { REACT_APP_BASE_URL } from "./variables";
import log from "loglevel";
import http from "http";
import jsonBody from "body/json";
import { exit } from "process";
import { AddressInfo } from "net";
import open from "open";
import { NodeJsBundler } from "./bundlers/javascript/nodeJsBundler";
import { NodeTsBundler } from "./bundlers/typescript/nodeTsBundler";
import { NodeJsBinaryDependenciesBundler } from "./bundlers/javascript/nodeJsBinaryDepenciesBundler";
import { NodeTsBinaryDependenciesBundler } from "./bundlers/typescript/nodeTsBinaryDepenciesBundler";
import { languages } from "./utils/languages";
import { saveAuthToken } from "./utils/accounts";

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

export async function deleteProjectHandler(projectId: string, forced: boolean) {
  // show prompt if no project id is selected
  if (typeof projectId === "string" && projectId.trim().length === 0) {
    const projects = await listProjects();
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
      projectId = projects[selectionNum - 1].split(":")[3].trim();
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

  const functionUrlForFilePath: { [id: string]: string } = {};
  const classesInfo: {
    className: any;
    methodNames: any;
    path: string;
    functionUrl: any;
    projectId: string;
  }[] = [];

  const promisesDeploy: any = configuration.classes.map(
    async (element: any) => {
      if (!(await fileExists(element.path))) {
          log.error(`\`${element.path}\` file does not exist at the indicated path.`)
          exit(1)
      }

      switch (element.language) {
        case ".ts": {
          const bundler = new NodeTsBundler();
          const binaryDepBundler = new NodeTsBinaryDependenciesBundler();

          let output = await bundler.bundle({
            configuration: element,
            path: element.path,
            extra: {
              mode: "production"
            }
          });

          output = await binaryDepBundler.bundle(output);

          const archivePath = path.join(
            await createTemporaryFolder("genezio-"),
            `genezioDeploy.zip`
          );
          await zipDirectory(output.path, archivePath);

          const prom = deployClass(
            element,
            archivePath,
            configuration.name,
            output.extra?.className
          ).then((result) => {
            functionUrlForFilePath[path.parse(element.path).name] =
              result.functionUrl;

            classesInfo.push({
              className: output.extra?.className,
              methodNames: output.extra?.methodNames,
              path: element.path,
              functionUrl: result.functionUrl,
              projectId: result.class.ProjectID
            });

            fs.promises.unlink(archivePath);
          });
          return prom;
        }
        case ".js": {
          const bundler = new NodeJsBundler();
          const binaryDepBundler = new NodeJsBinaryDependenciesBundler();

          let output = await bundler.bundle({
            configuration: element,
            path: element.path,
            extra: {
              mode: "development"
            }
          });

          output = await binaryDepBundler.bundle(output);

          const archivePath = path.join(
            await createTemporaryFolder("genezio-"),
            `genezioDeploy.zip`
          );
          await zipDirectory(output.path, archivePath);

          const prom = deployClass(
            element,
            archivePath,
            configuration.name,
            output.extra?.className
          ).then((result) => {
            functionUrlForFilePath[path.parse(element.path).name] =
              result.functionUrl;

            classesInfo.push({
              className: output.extra?.className,
              methodNames: output.extra?.methodNames,
              path: element.path,
              functionUrl: result.functionUrl,
              projectId: result.class.ProjectID
            });

            fs.promises.unlink(archivePath);
          });
          return prom;
        }
        default:
          log.error(`Unsupported ${element.language}`);
          return Promise.resolve();
      }
    }
  );

  // wait for all promises to finish
  await Promise.all(promisesDeploy);

  await generateSdks(functionUrlForFilePath).catch((error) => {
    console.log("Generate sdk", error)
    throw error;
  });

  reportSuccess(classesInfo, configuration);

  const projectId = classesInfo[0].projectId;
  console.log(
    `Your project has been deployed and is available at ${REACT_APP_BASE_URL}/project/${projectId}`
  );
}

export function reportSuccess(
  classesInfo: any,
  projectConfiguration: ProjectConfiguration
) {
  log.info(
    "\x1b[36m%s\x1b[0m",
    "Your code was deployed and the SDK was successfully generated!"
  );

  // print function urls
  let printHttpString = "";

  classesInfo.forEach((classInfo: any) => {
    classInfo.methodNames.forEach((methodName: any) => {
      const type = projectConfiguration.getMethodType(
        classInfo.path,
        methodName
      );

      if (type === TriggerType.http) {
        printHttpString +=
          `  - ${classInfo.className}.${methodName}: ${classInfo.functionUrl}${classInfo.className}/${methodName}` +
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

export async function generateSdks(urlMap: any) {
  const configurationFileContentUTF8 = await readUTF8File("./genezio.yaml");
  const configurationFileContent = await parse(configurationFileContentUTF8);
  const configuration = await ProjectConfiguration.create(
    configurationFileContent
  );
  const outputPath = configuration.sdk.path;
  const language = configuration.sdk.language;

  // check if the output path exists
  if (await fileExists(outputPath)) {
    // delete the output path
    fs.rmSync(outputPath, { recursive: true, force: true });
  }

  const sdk = await generateSdk(configuration, urlMap).catch((error) => {
    throw error;
  });

  if (sdk.remoteFile) {
    await writeToFile(outputPath, "remote.js", sdk.remoteFile, true).catch(
      (error) => {
        log.error(error.toString());
      }
    );
  }

  await Promise.all(
    sdk.classFiles.map((classFile: any) => {
      return writeToFile(
        outputPath,
        `${classFile.filename}.sdk.${language}`,
        classFile.implementation,
        true
      );
    })
  );
}

export async function init() {
  let projectName = "";
  while (projectName.length === 0) {
    projectName = await askQuestion(`What is the name of the project: `);
    if (projectName.length === 0) {
      log.error("The project name can't be empty.");
    }
  }
  const sdk: any = { name: projectName, sdk: {}, classes: [] };

  const language = await askQuestion(
    `In what programming language do you want your SDK? (js or ts) [default value: js]: `,
    "js"
  );

  if (!languages.includes(language)) {
    throw Error(
      `We don't currently support the ${language} language. You can open an issue ticket at https://github.com/Genez-io/genezio/issues.`
    );
  }
  sdk.sdk.language = language;

  if (language === "js" || language === "ts") {
    const runtime = await askQuestion(
      `What runtime will you use? Options: "node" or "browser". [default value: node]: `,
      "node"
    );
    if (runtime !== "node" && runtime !== "browser") {
      throw Error(`We don't currently support this JS runtime ${runtime}.`);
    }

    sdk.sdk.runtime = runtime;
  }

  const path = await askQuestion(
    `Where do you want to save your SDK? [default value: ./sdk/]: `,
    "./sdk/"
  );
  sdk.sdk.path = path;

  const doc = new Document(sdk);
  doc.commentBefore = `File that configures what classes will be deployed in Genezio Infrastructure.
Add the paths to classes that you want to deploy in "classes".

Example:

name: hello-world
sdk:
  language: js
  runtime: node
  path: ./sdk/
classes:
  - path: ./hello.js
    type: jsonrpc
    methods:
      - name: hello
        type: http`;

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
    saveAuthToken(accessToken)
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
          log.info(`Welcome! You can now start using genez.io.`);
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.setHeader("Access-Control-Allow-Headers", "Content-Type");
          res.setHeader("Access-Control-Allow-Methods", "POST");
          res.setHeader("Access-Control-Allow-Credentials", "true");
          res.writeHead(301, {
            Location: `${REACT_APP_BASE_URL}/cli/login/success`
          });
          res.end();
  
          exit(0);
        })
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
