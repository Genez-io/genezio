import path from "path";
import fs from "fs";
import {
  createTemporaryFolder,
  deleteFolder,
  getAllFilesFromCurrentPath,
  readUTF8File,
  writeToFile,
} from "../../utils/file";
import {
  BundlerInput,
  BundlerInterface,
  BundlerOutput,
  Dependency,
} from "../bundler.interface";
import FileDetails from "../../models/fileDetails";
import { default as fsExtra } from "fs-extra";
import { lambdaHandler } from "./lambdaHander";
import log from "loglevel";
import { debugLogger } from "../../utils/logging";
import esbuild, { BuildResult, Plugin, BuildFailure, Message } from "esbuild";
import { nodeExternalsPlugin } from "esbuild-node-externals";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const exec = require("await-exec");


export class NodeJsBundler implements BundlerInterface {
  async #copyDependencies(dependenciesInfo: Dependency[] | undefined, tempFolderPath: string, mode: "development" | "production") {
    const nodeModulesPath = path.join(tempFolderPath, "node_modules");

    if (mode === "development") {
      // copy node_modules folder to tmp folder if node_modules folder does not exist
      if (!fs.existsSync(nodeModulesPath) && fs.existsSync(path.join(process.cwd(), "node_modules"))) {
        await fsExtra.copy(path.join(process.cwd(), "node_modules"), nodeModulesPath);
      }
      return;
    }

    // Copy all dependencies from node_modules folder to tmp/node_modules folder
    if (!dependenciesInfo) {
      await fsExtra.copy(path.join(process.cwd(), "node_modules"), nodeModulesPath);
      return;
    }

    // Copy only required dependencies from node_modules folder to tmp/node_modules folder
    await Promise.all(
      dependenciesInfo.map((dependency: Dependency) => {
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
          file.extension !== ".ts" &&
          file.extension !== ".js" &&
          file.extension !== ".tsx" &&
          file.extension !== ".jsx" &&
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

  async #bundleNodeJSCode(
    filePath: string,
    tempFolderPath: string,
  ): Promise<void> {
    const outputFile = `module.mjs`;

    // delete module.js file if it exists
    if (fs.existsSync(path.join(tempFolderPath, outputFile))) {
      fs.unlinkSync(path.join(tempFolderPath, outputFile));
    }

    // Esbuild plugin that appends the following lines to the top of the file after it is bundled:
    // import { createRequire } from 'module';
    // const require = createRequire(import.meta.url);
    const supportRequireInESM: Plugin = {
      name: "esbuild-require-plugin",
      setup(build) {
        build.onLoad({ filter: /\.m?[jt]sx?$/ }, async (args) => {
          const contents = await fs.promises.readFile(args.path, "utf8");
          // Check if file doesn't use require()
          if (!contents.includes("require(")) {
            return { contents };
          }

          return {
            contents: `import { createRequire } from 'module';
          const require = createRequire(import.meta.url);
          ${contents}`,
            loader: "js",
          };
        });
      },
    };

    // eslint-disable-next-line no-async-promise-executor
    const output: BuildResult = await esbuild.build({
      entryPoints: [filePath],
      bundle: true,
      metafile: true,
      format: "esm",
      platform: "node",
      outfile: path.join(tempFolderPath, outputFile),
      plugins: [nodeExternalsPlugin(), supportRequireInESM],
    });

    if (output.errors.length > 0) {
      output.errors.forEach((error: any) => {
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

  async #getDependenciesInfo(filePath: string, bundlerInput: BundlerInput) {
    const tempFolderPath = await createTemporaryFolder();
    let output: BuildResult;
    let try_count = 0;
    const MAX_TRIES = 2;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        // Building with `metafile` field set to true will return a JSON object with information about the dependencies
        output = await esbuild.build({
          entryPoints: [filePath],
          bundle: true,
          metafile: true,
          platform: "node",
          outfile: path.join(tempFolderPath, "module.mjs"),
          logLevel: "silent",
        });
        break;
      } catch (error: BuildFailure | any) {
        if (try_count >= MAX_TRIES) {
          throw error;
        }

        // If there is a build failure, check if it is caused by missing library dependencies
        // If it is, install them and try again
        const resolveRegex = /Could not resolve "(?<dependencyName>.+)"/;
        const missingPackages = error.errors.map((error: Message) => {
          // Only looking for missing dependencies in the library code (node_modules)
          if (!error.location?.file?.startsWith("node_modules/")) {
            return undefined;
          }

          return resolveRegex.exec(error.text)?.groups?.dependencyName;
        });

        const installing = missingPackages.filter((dependencyName: string) => dependencyName !== undefined);
        const command = "npm install " + installing.join(" ");

        log.info(`You are missing some library dependencies. Installing them now...`);

        // install missing packages
        await exec(command);

        if (
          missingPackages.some(
            (dependencyName: string) => dependencyName === undefined
          )
        ) {
          throw error;
        }
      }

      try_count++;
    }

    if (output.metafile === undefined) {
      throw new Error("Could not get dependencies info");
    }

    const dependencyMap: Map<string, string> = new Map();
    Object.keys(output.metafile.inputs).forEach((value) => {
      if (!value.startsWith("node_modules")) {
        return;
      }

      const dependencyName = value.split(path.sep)[1];
      const dependencyPath = path.resolve(path.join("node_modules", dependencyName));

      // This should not ever happen. If you got here... Good luck!
      const existingDependencyPath = dependencyMap.get(dependencyName);
      if (existingDependencyPath !== undefined && existingDependencyPath !== dependencyPath) {
        throw new Error(`Dependency ${dependencyName} has two different paths: ${existingDependencyPath} and ${dependencyPath}`);
      }

      dependencyMap.set(dependencyName, dependencyPath);
    });

    bundlerInput.extra.dependenciesInfo = Array.from(dependencyMap.entries()).map(([name, path]) => ({ name, path }));

    await deleteFolder(tempFolderPath);
  }

  async #deleteTypeModuleFromPackageJson(tempFolderPath: string) {
    const packageJsonPath = path.join(tempFolderPath, "package.json");

    // check if package.json file exists
    if (!fs.existsSync(packageJsonPath)) {
      return;
    }

    // read package.json file
    const packageJson: any = JSON.parse(
      await readUTF8File(packageJsonPath) || "{}"
    );

    // delete type module from package.json
    delete packageJson.type;

    // write package.json file
    await writeToFile(tempFolderPath, "package.json", JSON.stringify(packageJson, null, 2));
  }

  async bundle(input: BundlerInput): Promise<BundlerOutput> {
    const mode = input.extra.mode;
    const tmpFolder = input.extra.tmpFolder;

    if (mode === "development" && !tmpFolder) {
      throw new Error("tmpFolder is required in development mode.")
    }

    const temporaryFolder = mode === "production" ? await createTemporaryFolder() : tmpFolder!;
    input.extra.dependenciesInfo = [];

    // 1. Run webpack to get dependenciesInfo and the packed file
    debugLogger.debug(`[NodeJSBundler] Get the list of node modules and bundling the javascript code for file ${input.path}.`)
    await Promise.all([
      this.#bundleNodeJSCode(
        input.configuration.path,
        temporaryFolder,
      ),
      mode === "development" ? this.#copyDependencies(undefined, temporaryFolder, mode) : Promise.resolve(),
      this.#getDependenciesInfo(input.configuration.path, input)
    ]);

    debugLogger.debug(`[NodeJSBundler] Copy non js files and node_modules for file ${input.path}.`)
    // 2. Copy non js files and node_modules and write index.mjs file
    await Promise.all([
      this.#copyNonJsFiles(temporaryFolder),
      mode === "production" ? this.#copyDependencies(input.extra.dependenciesInfo, temporaryFolder, mode) : Promise.resolve(),
      writeToFile(temporaryFolder, "index.mjs", lambdaHandler(`"${input.configuration.name}"`))
    ]);

    // 3. Delete type: module from package.json
    await this.#deleteTypeModuleFromPackageJson(temporaryFolder);

    return {
      ...input,
      path: temporaryFolder,
      extra: {
        ...input.extra,
        originalPath: input.path,
        dependenciesInfo: input.extra.dependenciesInfo,
      },
    };
  }
}
