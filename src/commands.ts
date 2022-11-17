import webpack, { NormalModule } from "webpack";
import path from "path";
import { deployClass } from "./requests/deployCode";
import generateSdk from "./requests/generateSdk";
import {
  createTemporaryFolder,
  fileExists,
  getFileDetails,
  readUTF8File,
  writeToFile,
  zipDirectory,
} from "./utils/file";
import { askQuestion } from "./utils/prompt";
import { parse, Document } from "yaml";
import fs from "fs";
import NodePolyfillPlugin from "node-polyfill-webpack-plugin";
import { ProjectConfiguration, TriggerType } from "./models/projectConfiguration";
import { NodeJsBundler } from "./bundlers/javascript/nodeJsBundler";
import { NodeJsBinaryDependenciesBundler } from "./bundlers/javascript/nodeJsBinaryDepenciesBundler";
import { getProjectConfiguration } from "./utils/configuration";


class AccessDependenciesPlugin {
  dependencies: string[];

  // constructor() {
  constructor(dependencies: string[]) {
    this.dependencies = dependencies;
  }

  apply(compiler: {
    hooks: {
      compilation: {
        tap: (arg0: string, arg1: (compilation: any) => void) => void;
      };
    };
  }) {
    compiler.hooks.compilation.tap(
      "AccessDependenciesPlugin",
      (compilation) => {
        NormalModule.getCompilationHooks(compilation).beforeLoaders.tap(
          "AccessDependenciesPlugin",
          (loader: any, normalModule: any) => {
            if (
              normalModule.resource &&
              normalModule.resource.includes("node_modules")
            ) {
              const resource = normalModule.resource;
              this.dependencies.push(resource);
            }
          }
        );
      }
    );
  }
}

export async function getNodeModules(filePath: string): Promise<any> {
  // eslint-disable-next-line no-async-promise-executor
  return new Promise(async (resolve, reject) => {
    const { name } = getFileDetails(filePath);
    const outputFile = `${name}-processed.js`;
    const temporaryFolder = await createTemporaryFolder();
    const dependencies: string[] = [];

    const compiler = webpack({
      entry: "./" + filePath,
      target: "node",
      mode: "production",
      output: {
        path: temporaryFolder,
        filename: outputFile,
        library: "genezio",
        libraryTarget: "commonjs"
      },
      plugins: [
        new NodePolyfillPlugin(),
        new AccessDependenciesPlugin(dependencies)
      ]
    });

    compiler.run((err) => {
      if (err) {
        reject(err);
        return;
      }

      const dependenciesInfo = dependencies.map((dependency) => {
        const relativePath = dependency.split("node_modules" + path.sep)[1];
        const dependencyName = relativePath?.split(path.sep)[0];
        const dependencyPath =
          dependency.split("node_modules" + path.sep)[0] +
          "node_modules" + path.sep +
          dependencyName;
        return {
          name: dependencyName,
          path: dependencyPath
        };
      });

      // remove duplicates from dependenciesInfo by name
      const uniqueDependenciesInfo = dependenciesInfo.filter(
        (v, i, a) => a.findIndex((t) => t.name === v.name) === i
      );

      resolve(uniqueDependenciesInfo);
    });
  });
}

export async function addNewClass(classPath: string, classType: string) {
  if (classType === undefined) {
    classType = "jsonrpc";
  } else if (!["http", "jsonrpc"].includes(classType)) {
    throw new Error(
      "Invalid class type. Valid class types are 'http' and 'jsonrpc'."
    );
  }

  if (classPath === undefined || classPath === "") {
    console.error("Please provide a path to the class you want to add.");
    return;
  }

  const projectConfiguration = await getProjectConfiguration()

  const className = classPath.split(path.sep).pop();

  if (!className) {
    console.error("Invalid class path.");
    return;
  }

  const classExtension = className.split(".").pop();
  if (!classExtension || className.split(".").length < 2) {
    console.error("Invalid class extension.");
    return;
  }

  // check if class already exists
  if (projectConfiguration.classes.length > 0) {
    if (
      projectConfiguration.classes
        .map((c) => c.path.split(path.sep).pop())
        .includes(className)
    ) {
      console.error("Class already exists.");
      return;
    }
  }

  // create the file if it does not exist
  if (!(await fileExists(classPath))) {
    await writeToFile(".", classPath, "", true).catch((error) => {
      console.error(error.toString());
      throw error
    });
  }

  projectConfiguration.addClass(classPath, classType as TriggerType, [])
  await projectConfiguration.writeToFile()

  console.log("\x1b[36m%s\x1b[0m", "Class added successfully.");
}

export async function newDeployClasses() {
  const configurationFileContentUTF8 = await readUTF8File("./genezio.yaml");
  const configurationFileContent = await parse(configurationFileContentUTF8);
  const configuration = await ProjectConfiguration.create(configurationFileContent)

  if (configuration.classes.length === 0) {
    throw new Error(
      "You don't have any class in specified in the genezio.yaml configuration file. Add a class with 'genezio addClass <className> <classType>' field and then call again 'genezio deploy'."
    );
  }

  const functionUrlForFilePath: {[id: string]: string} = {}
  const classesInfo = []

  let projectId = undefined
  for (const element of configuration.classes) {
    const currentFolder = process.cwd()
    switch(element.language) {
      case ".js": {
        const bundler = new NodeJsBundler()
        const binaryDepBundler = new NodeJsBinaryDependenciesBundler()

        let output = await bundler.bundle({configuration: element, path: element.path})
        output = await binaryDepBundler.bundle(output)

        const archivePath = path.join(currentFolder, `genezioDeploy.zip`);
        await zipDirectory(output.path, archivePath)

        const result = await deployClass(element, archivePath, configuration.name, output.extra?.className)

        functionUrlForFilePath[path.parse(element.path).name] = result.functionUrl;
        projectId = result.class.ProjectID

        classesInfo.push({className: output.extra?.className, methodNames: output.extra?.methodNames, path: element.path, functionUrl: result.functionUrl })

        await fs.promises.unlink(archivePath)
        break;
      }
      default:
        console.log(`Unsupported ${element.language}`)
    }
  }

  await generateSdks(functionUrlForFilePath)

  reportSuccess(classesInfo, configuration)

  return projectId
}

export function reportSuccess(classesInfo: any, projectConfiguration: ProjectConfiguration) {
  console.log(
    "\x1b[36m%s\x1b[0m",
    "Your code was deployed and the SDK was successfully generated!"
  );

  // print function urls
  let printHttpString = "";

  classesInfo.forEach((classInfo: any) => {
    classInfo.methodNames.forEach((methodName: any) => {
      const type = projectConfiguration.getMethodType(classInfo.path, methodName)

      if (type === TriggerType.http) {
        printHttpString +=
        `  - ${classInfo.className}.${methodName}: ${classInfo.functionUrl}${classInfo.className}/${methodName}` +
        "\n";
      }
    })
  })

  if (printHttpString !== "") {
    console.log("");
    console.log("HTTP Methods Deployed:");
    console.log(printHttpString);
  }
}

export async function generateSdks(urlMap: any) {
  const configurationFileContentUTF8 = await readUTF8File("./genezio.yaml");
  const configurationFileContent = await parse(configurationFileContentUTF8);
  const configuration = await ProjectConfiguration.create(configurationFileContent);
  const outputPath = configuration.sdk.path;

  // check if the output path exists
  if (await fileExists(outputPath)) {
    // delete the output path
    fs.rmSync(outputPath, { recursive: true, force: true });
  }

  const sdk = await generateSdk(configuration, urlMap);
  if (sdk.remoteFile) {
    await writeToFile(outputPath, "remote.js", sdk.remoteFile, true).catch(
      (error) => {
        console.error(error.toString());
      }
    );
  }

  for (const classFile of sdk.classFiles) {
    await writeToFile(
      outputPath,
      `${classFile.filename}.sdk.js`,
      classFile.implementation,
      true
    ).catch((error) => {
      console.error(error.toString());
    });
  }
}

export async function init() {
  let projectName = "";
  while (projectName.length === 0) {
    projectName = await askQuestion(`What is the name of the project: `);
    if (projectName.length === 0) {
      console.log("The project name can't be empty.");
    }
  }
  const sdk: any = { name: projectName, sdk: {}, classes: [] };

  const language = await askQuestion(
    `In what programming language do you want your SDK? [default value: js]: `,
    "js"
  );

  if (language !== "js") {
    throw Error(
      `We don't currently support the ${language} language. You can open an issue ticket at https://github.com/Genez-io/genezio/issues.`
    );
  }
  sdk.sdk.language = language;

  if (language === "js") {
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
      console.error(error.toString());
    }
  );

  console.log("");
  console.log(
    "\x1b[36m%s\x1b[0m",
    "Your genezio project was successfully initialized!"
  );
  console.log("");
  console.log(
    "The genezio.yaml configuration file was generated. You can now add the classes that you want to deploy using the 'genezio addClass <className> <classType>' command."
  );
  console.log("");
}
