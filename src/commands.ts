import webpack from "webpack";
import path from "path";
import {
  prepareDeployment,
  uploadArchiveToS3,
  finalizeDeploy
} from "./requests/deployCode";
import generateSdk from "./requests/generateSdk";
import {
  createTemporaryFolder,
  fileExists,
  getFileDetails,
  readUTF8File,
  writeToFile,
  getAllNonJsFiles,
  zipDirectory
} from "./utils/file";
import { askQuestion } from "./utils/prompt";
import BundledCode from "./models/bundledCode";
import { parse, Document } from "yaml";
import fs from "fs";
import { connected } from "process";
import { CommanderError } from "commander";
import FileDetails from "./models/fileDetails";

export async function bundleJavascriptCode(
  filePath: string
): Promise<BundledCode> {
  return new Promise(async (resolve, reject) => {
    const { name } = getFileDetails(filePath);
    const outputFile = `${name}-processed.js`;
    const temporaryFolder = await createTemporaryFolder();

    const compiler = webpack({
      entry: "./" + filePath,
      target: "node",
      mode: "production",
      node: false,
      optimization: {
        minimize: false
      },
      module: {
        rules: [
          {
            test: /\.html$/,
            loader: "dumb-loader",
            exclude: /really\.html/
          }
        ]
      },
      output: {
        path: temporaryFolder,
        filename: outputFile,
        library: "genezio",
        libraryTarget: "commonjs"
      }
    });

    compiler.run((error, stats) => {
      if (error) {
        reject(error);
        return;
      }

      if (stats?.hasErrors()) {
        reject(stats?.compilation.getErrors());
        return;
      }

      const filePath = path.join(temporaryFolder, outputFile);
      const module = require(filePath);
      const className = Object.keys(module.genezio)[0];
      const functionNames = Object.getOwnPropertyNames(
        module.genezio[className].prototype
      ).filter((x) => x !== "constructor");

      resolve(new BundledCode(filePath, className, functionNames));

      compiler.close((closeErr) => {
        /* TODO: handle error? */
      });
    });
  });
}

async function createDeployArchive(
  bundledJavascriptCode: BundledCode,
  allNonJsFilesPaths: FileDetails[]
) {
  const jsBundlePath = bundledJavascriptCode.path;

  const tmpPath = await createTemporaryFolder("genezio-");
  const archivePath = path.join(tmpPath, "genezioDeploy.zip");

  // check if the tmp folder exists
  if (!fs.existsSync(tmpPath)) {
    fs.mkdirSync(tmpPath, { recursive: true });
  }

  // check if archive already exists
  if (await fileExists(archivePath)) {
    fs.unlinkSync(archivePath);
  }

  // create file structure
  const jsBundleFile = path.join(tmpPath, "index.js");

  // create js bundle file in tmp folder from bundledJavascriptCode path
  fs.copyFileSync(jsBundlePath, jsBundleFile);

  // iterare over all non js files and copy them to tmp folder
  allNonJsFilesPaths.forEach((filePath, key) => {
    // get folders array
    const folders = filePath.path.split(path.sep);
    // remove file name from folders array
    folders.pop();
    // create folder structure in tmp folder
    const folderPath = path.join(tmpPath, ...folders);
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }
    // copy file to tmp folder
    const fileDestinationPath = path.join(tmpPath, filePath.path);
    fs.copyFileSync(filePath.path, fileDestinationPath);
  });

  // create zip archive
  await zipDirectory(tmpPath, archivePath);

  return archivePath;
}

async function deployFunction(
  filePath: string,
  language: string,
  sdkPath: string,
  runtime: string,
  projectName: string,
  allNonJsFilesPaths: FileDetails[]
) {
  if (!(await fileExists(filePath))) {
    throw new Error(`File ${filePath} does not exist!`);
  }

  const { name, extension, filename } = getFileDetails(filePath);

  switch (extension) {
    case ".js":
      console.log("Bundling javascript code...");
      const bundledJavascriptCode = await bundleJavascriptCode(filePath);
      const archivePath = await createDeployArchive(
        bundledJavascriptCode,
        allNonJsFilesPaths
      );
      console.log("Bundling done for class: " + name);
      console.log("Deploying bundle...\n");
      console.log(archivePath);

      const signedUrl = await prepareDeployment(
        filePath,
        extension,
        runtime,
        archivePath,
        projectName,
        name
      );

      const resAws = await uploadArchiveToS3(archivePath, signedUrl);

      const functionUrl = await finalizeDeploy(projectName, name);

      if (!functionUrl) {
        console.error(
          "A problem occured while contacting Genezio servers. Check your internet connection and try again!"
        );
        return;
      }

      return functionUrl;
    default:
      throw new Error(
        `Language represented by extension ${extension} is not supported!`
      );
  }
}

export async function deployFunctions() {
  const configurationFileContentUTF8 = await readUTF8File("./genezio.yaml");
  const configurationFileContent = await parse(configurationFileContentUTF8);

  const functionUrlForFilePath: any = {};

  const allNonJsFilesPaths = await getAllNonJsFiles();

  for (const filePath of configurationFileContent.classPaths) {
    const functionUrl = await deployFunction(
      filePath,
      configurationFileContent.sdk.language,
      configurationFileContent.sdk.path,
      configurationFileContent.sdk.runtime,
      configurationFileContent.name,
      allNonJsFilesPaths
    );

    functionUrlForFilePath[path.parse(filePath).name] = functionUrl;
  }

  await generateSdks("production", functionUrlForFilePath);

  console.log(
    "\x1b[36m%s\x1b[0m",
    "Your code was deployed and the SDK was successfully generated!"
  );
}

export async function generateSdks(env: string, urlMap?: any) {
  const configurationFileContentUTF8 = await readUTF8File("./genezio.yaml");
  const configurationFileContent = await parse(configurationFileContentUTF8);
  const outputPath = configurationFileContent.sdk.path;
  const sdk = await generateSdk(
    configurationFileContent.classPaths,
    configurationFileContent.sdk.runtime,
    env,
    urlMap
  );

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
  const projectName = await askQuestion(`What is the name of the project: `);
  const sdk: any = { name: projectName, sdk: {}, classPaths: [] };

  const language = await askQuestion(
    `In what programming language do you want your SDK? [js]: `,
    "js"
  );

  if (language !== "js") {
    throw Error(`We don't currently support this language ${language}.`);
  }
  sdk.sdk.language = language;

  if (language === "js") {
    const runtime = await askQuestion(
      `What runtime will you use? Options: "node" or "browser". [node]: `,
      "node"
    );
    if (runtime !== "node" && runtime !== "browser") {
      throw Error(`We don't currently support this JS runtime ${runtime}.`);
    }

    sdk.sdk.runtime = runtime;
  }

  const path = await askQuestion(
    `Where do you want to save your SDK? [./sdk/]: `,
    "./sdk/"
  );
  sdk.sdk.path = path;

  const doc = new Document(sdk);
  doc.commentBefore = `File that configures what classes will be deployed in Genezio Infrastructure. 
Add the paths to classes that you want to deploy in "classPaths".

Example:

name: hello-world
sdk:
  language: js
  runtime: node
  path: ./sdk/
classPaths:
  - "./hello-world/index.js"`;

  const yamlConfigurationFileContent = doc.toString();

  await writeToFile(".", "genezio.yaml", yamlConfigurationFileContent).catch(
    (error) => {
      console.error(error.toString());
    }
  );
}
