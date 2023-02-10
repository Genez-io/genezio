import path from "path";
import fs from "fs";
import webpackNodeExternals from "webpack-node-externals";
import {
  createTemporaryFolder,
  getAllFilesFromCurrentPath,
  getFileDetails,
  readUTF8File,
  writeToFile
} from "../../utils/file";
import {
  BundlerInput,
  BundlerInterface,
  BundlerOutput,
  AccessDependenciesPlugin
} from "../bundler.interface";
import FileDetails from "../../models/fileDetails";
import { default as fsExtra } from "fs-extra";
import { lambdaHandler } from "../../utils/lambdaHander";
import log from "loglevel";
import { exit } from "process";
import NodePolyfillPlugin from "node-polyfill-webpack-plugin";
import { bundle } from "../../utils/webpack";
import { debugLogger } from "../../utils/logging";

export class NodeJsBundler implements BundlerInterface {
  async #getNodeModulesJs(
    filePath: string,
    mode: "development" | "production"
  ): Promise<any> {

    if (mode === "development") {
      return null;
    }

    const { name } = getFileDetails(filePath);
    const outputFile = `${name}-processed.js`;
    const temporaryFolder = await createTemporaryFolder();
    const dependencies: string[] = [];

    await bundle(
      "./" + filePath,
      mode,
      [],
      undefined,
      [new NodePolyfillPlugin(), new AccessDependenciesPlugin(dependencies)],
      temporaryFolder,
      outputFile,
      {
        conditionNames: ["require"]
      }
      // eslint-disable-next-line @typescript-eslint/no-empty-function
    );

    const dependenciesInfo = dependencies.map((dependency) => {
      const relativePath = dependency.split("node_modules" + path.sep)[1];
      const dependencyName = relativePath?.split(path.sep)[0];
      const dependencyPath =
        dependency.split("node_modules" + path.sep)[0] +
        "node_modules" +
        path.sep +
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

    return uniqueDependenciesInfo;
  }

  async #copyDependencies(dependenciesInfo: any, tempFolderPath: string, mode: "development" | "production", firstRun: boolean) {
    const nodeModulesPath = path.join(tempFolderPath, "node_modules");

    if (mode === "development") {
      if (firstRun) {
        // copy complete node_modules folder
        await fsExtra.copy(path.join(process.cwd(), "node_modules"), nodeModulesPath);
        return;
      }
      return
    }


    // copy all dependencies to node_modules folder
    await Promise.all(
      dependenciesInfo.map((dependency: any) => {
        const dependencyPath = path.join(nodeModulesPath, dependency.name);
        return fsExtra.copy(dependency.path, dependencyPath);
      })
    );
  }

  async #copyNonJsFiles(tempFolderPath: string) {
    const allNonJsFilesPaths = (await getAllFilesFromCurrentPath()).filter(
      (file: FileDetails) => {
        
        // filter js files, node_modules and folders
        return (
          file.extension !== ".js" &&
          !file.path.includes("node_modules") &&
          !fs.lstatSync(file.path).isDirectory()
        );
      }
    );

    // iterare over all non js files and copy them to tmp folder
    await Promise.all(
      allNonJsFilesPaths.map((filePath: FileDetails) => {
        // get folders array
        const folders = filePath.path.split(path.sep);
        // remove file name from folders array
        folders.pop();
        // create folder structure in tmp folder
        const folderPath = path.join(tempFolderPath, ...folders);
        if (!fs.existsSync(folderPath)) {
          fs.mkdirSync(folderPath, { recursive: true });
        }
        // copy file to tmp folder
        const fileDestinationPath = path.join(tempFolderPath, filePath.path);
        return fs.promises.copyFile(filePath.path, fileDestinationPath);
      })
    );
  }

  async #bundleJavascriptCode(
    filePath: string,
    tempFolderPath: string,
    mode: "development" | "production"
  ): Promise<void> {
    const outputFile = `module.js`;

    // eslint-disable-next-line no-async-promise-executor
    const output: any = await bundle(
      "./" + filePath,
      mode,
      [webpackNodeExternals()],
      {
        rules: [
          {
            test: /\.html$/,
            loader: "dumb-loader",
            exclude: /really\.html/
          }
        ]
      },
      undefined,
      tempFolderPath,
      outputFile
    );

    if (output != undefined) {
      output.forEach((error: any) => {
        // log error red
        log.error("\x1b[31m", "Syntax error:");

        if (error.moduleIdentifier?.includes("|")) {
          log.info(
            "\x1b[37m",
            "file: " +
              error.moduleIdentifier?.split("|")[1] +
              ":" +
              error.loc?.split(":")[0]
          );
        } else {
          log.info(
            "file: " + error.moduleIdentifier + ":" + error.loc?.split(":")[0]
          );
        }

        // get first line of error
        const firstLine = error.message.split("\n")[0];
        log.info(firstLine);

        //get message line that contains '>' first character
        const messageLine: string = error.message
          .split("\n")
          .filter((line: any) => line.startsWith(">") || line.startsWith("|"))
          .join("\n");
        if (messageLine) {
          log.info(messageLine);
        }
      });
      throw "Compilation failed";
    }
  }


  async bundle(input: BundlerInput): Promise<BundlerOutput> {
    const mode =
      (input.extra ? input.extra["mode"] : undefined) || "production";
    const firstRun =
      (input.extra ? input.extra["firstRun"] : true) || true;
    const tmpFolder = (input.extra ? input.extra["tmpFolder"] : undefined) || undefined;
    
    if (mode === "production" && !tmpFolder) {
      throw new Error("tmpFolder is required in production mode.")
    }

      const temporaryFolder = mode === "production" ? await createTemporaryFolder() : tmpFolder;


    // 1. Run webpack to get dependenciesInfo and the packed file
    debugLogger.debug(`[NodeJSBundler] Get the list of node modules and bundling the javascript code for file ${input.path}.`)
    const [dependenciesInfo, _] = await Promise.all([
      this.#getNodeModulesJs(input.path, mode),
      this.#bundleJavascriptCode(
        input.configuration.path,
        temporaryFolder,
        mode
      )
    ]);

    debugLogger.debug(`[NodeJSBundler] Copy non js files and node_modules for file ${input.path}.`)
    // 2. Copy non js files and node_modules and write index.js file
    await Promise.all([
      this.#copyNonJsFiles(temporaryFolder),
      this.#copyDependencies(dependenciesInfo, temporaryFolder, mode, firstRun),
      writeToFile(temporaryFolder, "index.js", lambdaHandler(`"${input.configuration.name}"`))
    ]);

    return {
      ...input,
      path: temporaryFolder,
      extra: {
        dependenciesInfo
      }
    };
  }
}
