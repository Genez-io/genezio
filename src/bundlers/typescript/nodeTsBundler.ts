import path from "path";
import fs from "fs";
import util from "util";
import webpackNodeExternals from "webpack-node-externals";
import {
    createTemporaryFolder,
    getAllFilesFromCurrentPath,
    getFileDetails,
    writeToFile,
    readUTF8File,
    deleteFolder
} from "../../utils/file";
import {
    BundlerInput,
    BundlerInterface,
    BundlerOutput
} from "../bundler.interface";
import FileDetails from "../../models/fileDetails";
import { default as fsExtra } from "fs-extra";
import { lambdaHandler } from "../javascript/lambdaHander";
import { tsconfig } from "../../utils/configs";
import log from "loglevel";
import NodePolyfillPlugin from "node-polyfill-webpack-plugin";
import { AccessDependenciesPlugin } from "../bundler.interface";
import { bundle } from "../../utils/webpack";
import { debugLogger } from "../../utils/logging";
import ForkTsCheckerWebpackPlugin from "fork-ts-checker-webpack-plugin";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const exec = util.promisify(require("child_process").exec);

export class NodeTsBundler implements BundlerInterface {
    #generateTsconfigJson() {
        if (fs.existsSync("tsconfig.json")) {
            return;
        } else {
            console.log("No tsconfig.json file found. We will create one...")
            tsconfig.compilerOptions.rootDir = ".";
            tsconfig.compilerOptions.outDir = path.join(".", "build");
            tsconfig.include = [path.join(".", "**/*")];
            writeToFile(process.cwd(), "tsconfig.json", JSON.stringify(tsconfig, null, 4));
            // writeToFile(process.cwd(), "package.json", packagejson);
        }
    }

    async #getNodeModulesTs(
        filePath: string,
        mode: "development" | "production"
    ): Promise<any> {

        if (mode === "development") {
            return null;
        }

        const dependencies: string[] = [];
        const { name } = getFileDetails(filePath);
        const outputFile = `${name}-processed.js`;
        const temporaryFolder = await createTemporaryFolder();

        const module = {
            rules: [
                {
                    test: /\.tsx?$/,
                    use: [
                        {
                            loader: "ts-loader",
                            options: {
                                configFile: "tsconfig.json",
                                onlyCompileBundledFiles: true
                            }
                        }
                    ],
                    exclude: /really\.html/
                }
            ]
        };
        const plugins = [
            new NodePolyfillPlugin(),
            new AccessDependenciesPlugin(dependencies)
        ];
        const resolve = { extensions: [".tsx", ".ts", ".js"] };
        const resolveLoader = {
            modules: [path.resolve(__dirname, "../../../", "node_modules")],
            conditionNames: ["require"]
        };

        await bundle(
            "./" + filePath,
            mode,
            [],
            module,
            plugins,
            temporaryFolder,
            outputFile,
            resolve,
            resolveLoader
        );

        // delete the temporary folder
        await deleteFolder(temporaryFolder);

        const dependenciesInfo = dependencies.map((dependency) => {
            const relativePath = dependency.split("node_modules" + path.sep)[1];
            const dependencyName = relativePath?.split(path.sep)[0];
            const dependencyPath =
                dependency.split("node_modules" + path.sep)[0] +
                "node_modules" +
                path.sep +
                dependencyName;
            //dependencyPath.replace(folder, cwd);
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
    async #copyDependencies(dependenciesInfo: any, tempFolderPath: string, mode: "development" | "production") {
        const nodeModulesPath = path.join(tempFolderPath, "node_modules");

        if (mode === "development") {
            // copy node_modules folder to tmp folder if node_modules folder does not exist
            if (!fs.existsSync(nodeModulesPath) && fs.existsSync(path.join(process.cwd(), "node_modules"))) {
                await fsExtra.copy(path.join(process.cwd(), "node_modules"), nodeModulesPath);
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

    async #copyNonTsFiles(tempFolderPath: string) {
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
                const folders = filePath.path.split('/');
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

    async #bundleTypescriptCode(
        filePath: string,
        tempFolderPath: string,
        mode: "development" | "production"
    ): Promise<void> {


        // eslint-disable-next-line no-async-promise-executor
        const module = {
            rules: [
                {
                    test: /\.tsx?$/,
                    use: [
                        {
                            loader: "esbuild-loader",
                            options: {
                                tsconfig: "tsconfig.json",
                                target: "es2015",
                            }
                        }
                    ],
                    exclude: /really\.html/
                }
            ]
        };
        const resolve = { extensions: [".tsx", ".ts", ".js"] };
        const resolveLoader = {
            modules: [path.resolve(__dirname, "../../../", "node_modules")]
        };
        const outputFile = `module.js`;

        // delete module.js file if it exists
        if (fs.existsSync(path.join(tempFolderPath, outputFile))) {
            fs.unlinkSync(path.join(tempFolderPath, outputFile));
        }

        const output: any = await bundle(
            "./" + filePath,
            mode,
            [webpackNodeExternals()],
            module,
            mode === "development" ? undefined : [new ForkTsCheckerWebpackPlugin()],
            tempFolderPath,
            outputFile,
            resolve,
            resolveLoader
        );

        if (output != undefined) {
            if (mode === "development") {
                output.forEach((error: any) => {
                    log.info(error.message);
                });
            } else {
                output.forEach((error: any) => {
                    log.error(error.message);
                    log.error(error.file);
                });
            }

            throw "Compilation failed";
        }
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
        const mode =
            (input.extra ? input.extra["mode"] : undefined) || "production";
        const tmpFolder = (input.extra ? input.extra["tmpFolder"] : undefined) || undefined;

        if (mode === "development" && !tmpFolder) {
            throw new Error("tmpFolder is required in development mode.")
        }

        const temporaryFolder = mode === "production" ? await createTemporaryFolder() : tmpFolder;

        // 1. Create auxiliary folder and copy the entire project
        this.#generateTsconfigJson();

        debugLogger.debug(`[NodeTSBundler] Get the list of node modules and bundling the javascript code for file ${input.path}.`)
        // 2. Run webpack to get dependenciesInfo and the packed file
        const [dependenciesInfo, _] = await Promise.all([
            this.#getNodeModulesTs(input.path, mode),
            this.#bundleTypescriptCode(
                input.configuration.path,
                temporaryFolder,
                mode
            ),
            mode === "development" ? this.#copyDependencies(null, temporaryFolder, mode) : Promise.resolve()
        ]);

        debugLogger.debug(`[NodeTSBundler] Copy non TS files and node_modules for file ${input.path}.`)

        // 2. Copy non js files and node_modules and write index.js file
        await Promise.all([
            this.#copyNonTsFiles(temporaryFolder),
            mode === "production" ? this.#copyDependencies(dependenciesInfo, temporaryFolder, mode) : Promise.resolve(),
            writeToFile(temporaryFolder, "index.js", lambdaHandler(`"${input.configuration.name}"`))
        ]);

        // 3. Delete type: module from package.json
        await this.#deleteTypeModuleFromPackageJson(temporaryFolder);

        return {
            ...input,
            path: temporaryFolder,
            extra: {
                dependenciesInfo
            }
        };
    }
}
