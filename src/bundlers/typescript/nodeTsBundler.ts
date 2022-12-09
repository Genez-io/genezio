import { webpack } from "webpack";
import path from "path";
import fs from "fs";
import util from "util";
import webpackNodeExternals from "webpack-node-externals";
import {
    createTemporaryFolder,
    getAllFilesFromCurrentPath,
    getFileDetails,
    writeToFile
} from "../../utils/file";
import {
    BundlerInput,
    BundlerInterface,
    BundlerOutput
} from "../bundler.interface";
import FileDetails from "../../models/fileDetails";
import { default as fsExtra } from "fs-extra";
import { lambdaHandler } from "../../utils/lambdaHander";
import { tsconfig, packagejson } from "../../utils/configs";
import log from "loglevel";
import NodePolyfillPlugin from "node-polyfill-webpack-plugin";
import { AccessDependenciesPlugin } from "../bundler.interface";
import { bundle } from "../../utils/webpack";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const exec = util.promisify(require("child_process").exec);


export class NodeTsBundler implements BundlerInterface {
    #generateTsconfigJson(tempFolderPath: string) {
        tsconfig.compilerOptions.rootDir = process.cwd();
        tsconfig.compilerOptions.outDir = path.join(process.cwd(), "build");
        tsconfig.include = [path.join(process.cwd(), "**/*")];
        writeToFile(tempFolderPath, "tsconfig.json", JSON.stringify(tsconfig));
        writeToFile(tempFolderPath, "package.json", packagejson);
    }

    async #getNodeModulesTs(folder: string, filePath: string, mode: "development"|"production"): Promise<any> {
        const dependencies: string[] = [];
        const { name } = getFileDetails(filePath);
        const outputFile = `${name}-processed.js`;
        const temporaryFolder = await createTemporaryFolder();
        const module = {
            rules: [
                {
                    test: /\.tsx?$/,
                    use: [{
                        loader: "ts-loader",
                        options: {
                            configFile: (fs.existsSync("tsconfig.json") ? "./tsconfig.json" : path.join(folder, "tsconfig.json")),
                            onlyCompileBundledFiles: true
                        }
                    }],
                    exclude: /really\.html/
                }
            ]
        }
        const plugins = [
            new NodePolyfillPlugin(),
            new AccessDependenciesPlugin(dependencies)
        ]
        const resolve = { extensions: ['.tsx', '.ts', '.js'] }
        const resolveLoader = {
            modules: [path.resolve(__dirname, "../../../", "node_modules")]
        }

        await bundle("./" + filePath, mode, [], module, plugins, temporaryFolder, outputFile, resolve, resolveLoader)

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

        return uniqueDependenciesInfo
    }
    async #copyDependencies(dependenciesInfo: any, tempFolderPath: string) {
        const nodeModulesPath = path.join(tempFolderPath, "node_modules");
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
                    file.extension !== ".ts" && file.extension !== ".js" && file.extension !== ".tsx" && file.extension !== ".jsx" &&
                    path.basename(file.path) !== "package.json" &&
                    path.basename(file.path) !== "package-lock.json" &&
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

    async #bundleTypescriptCode(
        folder: string,
        filePath: string,
        tempFolderPath: string,
        mode: "development"|"production"
    ): Promise<void> {
        // eslint-disable-next-line no-async-promise-executor
        const module = {
            rules: [
                {
                    test: /\.tsx?$/,
                    use: [{
                        loader: "ts-loader",
                        options: {
                            configFile: (fs.existsSync("tsconfig.json") ? "./tsconfig.json" : path.join(folder, "tsconfig.json")),
                            onlyCompileBundledFiles: true
                        }
                    }],
                    exclude: /really\.html/
                }
            ]
        }
        const resolve = { extensions: ['.tsx', '.ts', '.js'] }
        const resolveLoader = {
            modules: [path.resolve(__dirname, "../../../", "node_modules")]
        }
        const outputFile = `module.js`;

        await bundle("./" + filePath, mode, [webpackNodeExternals()], module, undefined, tempFolderPath, outputFile, resolve, resolveLoader)

        //await writeToFile(tempFolderPath, "index.js", lambdaHandler);
    }

    async #getClassDetails(filePath: string, tempFolderPath: string): Promise<any> {
        const moduleJsPath = path.join(tempFolderPath, "module.js");

        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const module = require(moduleJsPath);

        const classes: string[] = [];

        let className = "";

        for (const name in module.genezio) {
            if (typeof module.genezio[name] == 'function') {
                classes.push(name);
                className = name;
            }
        }
        //console.log(typeof module.genezio["Directions"]);

        if (classes.length > 1) {
            log.warn(
                "\x1b[33m",
                `Warning: We found multiple classes exported from the ${filePath} file. For now, we support only one class per file.`
            );
            log.warn("\x1b[0m", "");
        }

        if (!className) {
            throw new Error(
                `No class was found in the ${filePath} file. Make sure you exported the class.`
            );
        }

        await writeToFile(tempFolderPath, "index.js", lambdaHandler(`"${className}"`));

        const methodNames = Object.getOwnPropertyNames(
            module.genezio[className].prototype
        ).filter((x) => x !== "constructor");

        return {
            className,
            methodNames
        };
    }

    async bundle(input: BundlerInput): Promise<BundlerOutput> {
        const auxFolder = await createTemporaryFolder();
        const temporaryFolder = await createTemporaryFolder();
        const mode = (input.extra ? input.extra["mode"] : undefined) || "production";

        // 1. Create auxiliary folder and copy the entire project
        this.#generateTsconfigJson(auxFolder);

        // 2. Run webpack to get dependenciesInfo and the packed file
        const [dependenciesInfo, _] = await Promise.all([
            this.#getNodeModulesTs(auxFolder, input.path, mode),
            this.#bundleTypescriptCode(auxFolder, input.configuration.path, temporaryFolder, mode)
        ]);

        // 3. Remove auxiliary folder
        fs.rmSync(auxFolder, { recursive: true, force: true });

        // 4. Copy non js files and node_modules
        await Promise.all([
            this.#copyNonTsFiles(temporaryFolder),
            this.#copyDependencies(dependenciesInfo, temporaryFolder)
        ]);

        // 5. Get class name
        const classDetails = await this.#getClassDetails(input.path, temporaryFolder);

        return {
            ...input,
            path: temporaryFolder,
            extra: {
                className: classDetails.className,
                methodNames: classDetails.methodNames,
                dependenciesInfo
            }
        };
    }
}
