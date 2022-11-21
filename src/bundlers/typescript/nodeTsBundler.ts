import { webpack } from "webpack";
import path from "path";
import fs from "fs";
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
import log from "loglevel";

export class NodeTsBundler implements BundlerInterface {
    async #getNodeModulesTs(filePath: string): Promise<any> {
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
                module: {
                    rules: [
                        {
                            test: /\.tsx?$/,
                            loader: "ts-loader",
                            exclude: /really\.html/
                        }
                    ]
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

                resolve(uniqueDependenciesInfo);
            });
        });
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
        filePath: string,
        tempFolderPath: string
    ): Promise<void> {
        // eslint-disable-next-line no-async-promise-executor
        return new Promise(async (resolve, reject) => {
            const outputFile = `module.js`;

            const compiler = webpack({
                entry: "./" + filePath,
                target: "node",

                externals: [webpackNodeExternals()], // in order to ignore all modules in node_modules folder

                mode: "production",
                node: false,
                optimization: {
                    minimize: false
                },
                module: {
                    rules: [
                        {
                            test: /\.tsx?$/,
                            loader: "ts-loader",
                            exclude: /really\.html/
                        }
                    ]
                },
                resolve: {
                    extensions: ['.tsx', '.ts', '.js'],
                },
                // compilation stats json
                output: {
                    path: tempFolderPath,
                    filename: outputFile,
                    library: "genezio",
                    libraryTarget: "commonjs"
                }
            });

            compiler.run(async (error, stats) => {
                if (error) {
                    console.error(error);
                    reject(error);
                    return;
                }

                if (stats?.hasErrors()) {
                    reject(stats?.compilation.getErrors());
                    return;
                }

                writeToFile(tempFolderPath, "index.js", lambdaHandler);

                compiler.close((closeErr) => {
                    /* TODO: handle error? */
                });

                resolve();
            });
        });
    }

    #getClassDetails(filePath: string, tempFolderPath: string): any {
        const moduleJsPath = path.join(tempFolderPath, "module.js");

        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const module = require(moduleJsPath);
        const className = Object.keys(module.genezio)[0];

        if (Object.keys(module.genezio).length > 1) {
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

        const methodNames = Object.getOwnPropertyNames(
            module.genezio[className].prototype
        ).filter((x) => x !== "constructor");

        return {
            className,
            methodNames
        };
    }

    async bundle(input: BundlerInput): Promise<BundlerOutput> {
        const temporaryFolder = await createTemporaryFolder();

        // 1. Run webpack to get dependenciesInfo and the packed file
        const [dependenciesInfo, _] = await Promise.all([
            this.#getNodeModulesTs(input.path),
            this.#bundleTypescriptCode(input.configuration.path, temporaryFolder)
        ]);

        // 2. Copy non js files and node_modules
        await Promise.all([
            this.#copyNonTsFiles(temporaryFolder),
            this.#copyDependencies(dependenciesInfo, temporaryFolder)
        ]);

        // 3. Get class name
        const classDetails = this.#getClassDetails(input.path, temporaryFolder);

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
