import path from "path";
import fs from "fs";
import {
  createTemporaryFolder,
  deleteFolder,
  getAllFilesFromCurrentPath,
  writeToFile,
} from "../../utils/file.js";
import {
  BundlerInput,
  BundlerInterface,
  BundlerOutput,
  Dependency,
} from "../bundler.interface.js";
import FileDetails from "../../models/fileDetails.js";
import { default as fsExtra } from "fs-extra";
import { lambdaHandler } from "./lambdaHander.js";
import log from "loglevel";
import { debugLogger } from "../../utils/logging.js";
import esbuild, { BuildResult, Plugin, BuildFailure, Message, Loader } from "esbuild";
import { nodeExternalsPlugin } from "esbuild-node-externals";
import colors from "colors"
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import exec from "await-exec";


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
          function getLoader(extension: string): Loader {
            switch (extension) {
              case "ts":
              case "mts":
                return "ts";
              case "tsx":
              case "mtsx":
                return "tsx";
              case "js":
              case "mjs":
                return "js";
              case "jsx":
              case "mjsx":
                return "jsx";
              default:
                return "js";
            }
          }

          const contents = await fs.promises.readFile(args.path, "utf8");
          const loader = getLoader(args.path.split(".").pop()!);

          // Check if file doesn't use require()
          if (!contents.includes("require(")) {
            return { contents, loader };
          }

          return {
            contents: `import { createRequire } from 'module';
            const require = createRequire(import.meta.url);
            ${contents}`,
            loader
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

  async #handleMissingDependencies(error: BuildFailure, try_count: number, MAX_TRIES: number) {
    // If there is a build failure, check if it is caused by missing library dependencies
    // If it is, install them and try again
    const resolveRegex = /Could not resolve "(?<dependencyName>.+)"/;
    let npmInstallRequired = false;
    const errToDeps = error.errors.map((error: Message) => {
      const packageName = resolveRegex.exec(error.text)?.groups?.dependencyName;
      if (packageName && !error.location?.file.startsWith("node_modules/")) {
        npmInstallRequired = true;
        return null;
      }

      return packageName;
    });
    const libraryDependencies: string[] = errToDeps.filter(
      (dependencyName: string | undefined | null): dependencyName is string =>
        !!dependencyName
    );

    if (try_count >= MAX_TRIES) {
      if (libraryDependencies.length > 0 || npmInstallRequired) {
        log.info(
          `You have some missing dependencies. If you want to install them automatically, please run with ${colors.green(
            "--install-deps"
          )} flag`
        );
      }
      throw error;
    }

    if (npmInstallRequired) {
      debugLogger.debug("Running command: npm install")
      await exec(`npm install`);
    }

    if (libraryDependencies.length > 0) {
      const lib_deps_command = "npm install --no-save " + libraryDependencies.join(" ");

      log.info(`You are missing some library dependencies. Installing them now...`);
      debugLogger.debug("Running command: " + lib_deps_command)

      // install missing library dependencies
      await exec(lib_deps_command);
    }

    if (errToDeps.some((dependencyName: string | undefined | null) => dependencyName === undefined)) {
      throw error;
    }
  }

  async #getDependenciesInfo(filePath: string, bundlerInput: BundlerInput) {
    const tempFolderPath = await createTemporaryFolder();
    let output: BuildResult;
    let try_count = 0;
    let MAX_TRIES = -1;

    if (bundlerInput.extra.installDeps) {
      MAX_TRIES = 2;
    }

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
        await this.#handleMissingDependencies(error, try_count, MAX_TRIES);
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

      // We use '/' as a separator regardless the platform because esbuild returns '/' separated paths
      const dependencyName = value.split("/")[1];
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

  async bundle(input: BundlerInput): Promise<BundlerOutput> {
    const mode = input.extra.mode;
    const tmpFolder = input.extra.tmpFolder;

    if (mode === "development" && !tmpFolder) {
      throw new Error("tmpFolder is required in development mode.")
    }

    const temporaryFolder = mode === "production" ? await createTemporaryFolder() : tmpFolder!;
    input.extra.dependenciesInfo = [];

    // 1. Run esbuild to get dependenciesInfo and the bundled file
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
