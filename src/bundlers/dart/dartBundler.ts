import axios, { AxiosResponse } from "axios";
import fs from "fs";
import path from "path";
import Mustache from "mustache";
import { getCompileDartPresignedURL } from "../../requests/getCompileDartPresignedURL.js";
import { uploadContentToS3 } from "../../requests/uploadContentToS3.js";
import admZip from "adm-zip";
import {
    createTemporaryFolder,
    deleteFolder,
    writeToFile,
    zipDirectory,
} from "../../utils/file.js";
import { BundlerInput, BundlerInterface, BundlerOutput } from "../bundler.interface.js";
import { checkIfDartIsInstalled } from "../../utils/dart.js";
import { debugLogger } from "../../utils/logging.js";
import {
    ClassConfiguration,
    MethodConfiguration,
    ParameterType,
} from "../../models/projectConfiguration.js";
import { template } from "./dartMain.js";
import { default as fsExtra } from "fs-extra";
import { DART_COMPILATION_ENDPOINT } from "../../constants.js";
import { TriggerType } from "../../yamlProjectConfiguration/models.js";
import { spawnSync } from "child_process";
import { log } from "../../utils/logging.js";
import { runNewProcess } from "../../utils/process.js";
import { getAllFilesFromCurrentPath } from "../../utils/file.js";
import FileDetails from "../../models/fileDetails.js";
import {
    ArrayType,
    AstNodeType,
    ClassDefinition,
    CustomAstNodeType,
    MapType,
    Node,
    Program,
    PromiseType,
} from "../../models/genezioModels.js";
import {
    castArrayRecursivelyInitial,
    castMapRecursivelyInitial,
} from "../../utils/dartAstCasting.js";
import { GENEZIO_NOT_ENOUGH_PERMISSION_FOR_FILE, UserError } from "../../errors.js";
import { Status } from "../../requests/models.js";

export class DartBundler implements BundlerInterface {
    async #getDartCompilePresignedUrl(archiveName: string): Promise<string> {
        return (await getCompileDartPresignedURL(archiveName)).presignedURL;
    }

    async #analyze(path: string) {
        const result = spawnSync("dart", ["analyze", "--no-fatal-warnings"], {
            cwd: path,
        });

        if (result.status != 0) {
            log.info(result.stdout.toString().split("\n").slice(1).join("\n"));
            throw new UserError("Compilation error! Please check your code and try again.");
        }
    }

    async #compile(archiveName: string): Promise<{ success: boolean; downloadUrl: string }> {
        const url = DART_COMPILATION_ENDPOINT;

        const response: AxiosResponse<Status<{ success: boolean; downloadUrl: string }>> =
            await axios({
                method: "PUT",
                url: url,
                data: { archiveName },
                maxContentLength: Infinity,
                maxBodyLength: Infinity,
            });

        if (response.data.status === "error") {
            throw new UserError(response.data.error.message);
        }

        return response.data;
    }

    async #downloadAndUnzipFromS3ToFolder(
        s3ZipUrl: string,
        temporaryFolder: string,
    ): Promise<void> {
        const compiledZip = path.join(temporaryFolder, "compiled.zip");

        return await axios({
            url: s3ZipUrl,
            responseType: "arraybuffer",
        })
            .then((response) => {
                fs.writeFileSync(compiledZip, response.data);
            })
            .then(async () => {
                const zip = new admZip(compiledZip);
                try {
                    zip.extractAllTo(temporaryFolder, true);
                } catch (error) {
                    debugLogger.debug(`Failed to extract files: ${error}`);
                    throw new Error("Failed to extract files. Please open an issue on GitHub");
                }
                fs.unlinkSync(compiledZip);
            });
    }

    #castParameterToPropertyType(node: Node, variableName: string): string {
        let implementation = "";

        switch (node.type) {
            case AstNodeType.StringLiteral:
                implementation += `${variableName} as String`;
                break;
            case AstNodeType.DoubleLiteral:
                implementation += `${variableName} as double`;
                break;
            case AstNodeType.BooleanLiteral:
                implementation += `${variableName} as bool`;
                break;
            case AstNodeType.IntegerLiteral:
                implementation += `${variableName} as int`;
                break;
            case AstNodeType.PromiseType:
                implementation += this.#castParameterToPropertyType(
                    (node as PromiseType).generic,
                    variableName,
                );
                break;
            case AstNodeType.CustomNodeLiteral:
                implementation += `${
                    (node as CustomAstNodeType).rawValue
                }.fromJson(${variableName} as Map<String, dynamic>)`;
                break;
            case AstNodeType.ArrayType:
                implementation += castArrayRecursivelyInitial(node as ArrayType, variableName);
                break;
            case AstNodeType.MapType:
                implementation += castMapRecursivelyInitial(node as MapType, variableName);
        }

        return implementation;
    }

    #getProperCast(
        mainClass: ClassDefinition,
        method: MethodConfiguration,
        parameterType: ParameterType,
        index: number,
    ): string {
        const type = mainClass.methods
            .find((m) => m.name == method.name)
            ?.params.find((p) => p.name == parameterType.name);

        if (!type) throw new UserError("Type not found");

        return `${this.#castParameterToPropertyType(type.paramType, `params[${index}]`)}`;
    }

    async #createRouterFileForClass(
        classConfiguration: ClassConfiguration,
        ast: Program,
        folderPath: string,
    ): Promise<void> {
        const mainClass = ast.body?.find((element) => {
            return element.type === AstNodeType.ClassDefinition;
        }) as ClassDefinition;

        const moustacheViewForMain = {
            classFileName: path.basename(
                classConfiguration.path,
                path.extname(classConfiguration.path),
            ),
            className: classConfiguration.name,
            jsonRpcMethods: classConfiguration.methods
                .filter((m) => m.type === TriggerType.jsonrpc)
                .map((m) => ({
                    name: m.name,
                    parameters: m.parameters.map((p, index) => ({
                        index,
                        cast: this.#getProperCast(mainClass, m, p, index),
                    })),
                })),
            cronMethods: classConfiguration.methods
                .filter((m) => m.type === TriggerType.cron)
                .map((m) => ({
                    name: m.name,
                })),
            httpMethods: classConfiguration.methods
                .filter((m) => m.type === TriggerType.http)
                .map((m) => ({
                    name: m.name,
                })),
            imports: ast.body?.map((element) => ({ name: element.path })),
        };

        const routerFileContent = Mustache.render(template, moustacheViewForMain);
        await writeToFile(folderPath, "main.dart", routerFileContent);
    }

    async #uploadUserCodeToS3(
        projectName: string,
        className: string,
        userCodeFolderPath: string,
    ): Promise<string> {
        const random = Math.random().toString(36).substring(2);
        const archiveName = `${projectName}${className}${random}.zip`;
        const presignedUrl = await this.#getDartCompilePresignedUrl(archiveName);

        const archiveDirectoryOutput = await createTemporaryFolder();
        const archivePath = path.join(archiveDirectoryOutput, archiveName);

        try {
            await zipDirectory(userCodeFolderPath, archivePath);
            await uploadContentToS3(presignedUrl, archivePath);
        } finally {
            // remove temporary folder
            await deleteFolder(archiveDirectoryOutput);
        }

        return archiveName;
    }

    async #addLambdaRuntimeDependency(path: string) {
        const success = await runNewProcess(
            "dart pub add aws_lambda_dart_runtime:'^1.1.0'",
            path,
            false,
            false,
        );

        if (!success) {
            throw new UserError("Error while adding aws_lambda_dart_runtime dependency");
        }
    }

    async #copyNonDartFiles(tempFolderPath: string) {
        const allNonJsFilesPaths = (await getAllFilesFromCurrentPath()).filter(
            (file: FileDetails) => {
                // filter js files, node_modules and folders
                return (
                    file.extension !== ".dart" &&
                    !file.path.includes(".git") &&
                    !fs.lstatSync(file.path).isDirectory()
                );
            },
        );

        // iterate over all non dart files and copy them to tmp folder
        await Promise.all(
            allNonJsFilesPaths.map((filePath: FileDetails) => {
                // create folder structure in tmp folder
                const folderPath = path.join(tempFolderPath, path.dirname(filePath.path));
                if (!fs.existsSync(folderPath)) {
                    fs.mkdirSync(folderPath, { recursive: true });
                }
                // copy file to tmp folder
                const fileDestinationPath = path.join(tempFolderPath, filePath.path);
                return fs.promises.copyFile(filePath.path, fileDestinationPath).catch((error) => {
                    if (error.code === "EACCES") {
                        throw new UserError(GENEZIO_NOT_ENOUGH_PERMISSION_FOR_FILE(filePath.path));
                    }

                    throw error;
                });
            }),
        );
    }

    async bundle(input: BundlerInput): Promise<BundlerOutput> {
        // Create a temporary folder were we copy user code to prepare everything.
        const folderPath = input.genezioConfigurationFilePath;
        const inputTemporaryFolder = await createTemporaryFolder(input.configuration.name);
        let temporaryFolder: string | undefined = undefined;

        try {
            await fsExtra.copy(folderPath, inputTemporaryFolder);
            debugLogger.debug(`Copy files in temp folder ${inputTemporaryFolder}`);

            // Create the router class
            const userClass = input.projectConfiguration.classes.find(
                (c: ClassConfiguration) => c.path == input.path,
            );

            if (!userClass) throw new UserError("Class not found while bundling");

            this.#createRouterFileForClass(userClass, input.ast, inputTemporaryFolder);

            // Check if dart is installed
            await checkIfDartIsInstalled();

            await this.#addLambdaRuntimeDependency(inputTemporaryFolder);

            await this.#analyze(inputTemporaryFolder);

            const archiveName = await this.#uploadUserCodeToS3(
                input.projectConfiguration.name,
                userClass.name,
                inputTemporaryFolder,
            );

            // Compile the Dart code on the server
            debugLogger.debug("Compiling Dart...");
            const s3Zip = await this.#compile(archiveName);
            debugLogger.debug("Compiling Dart finished.");

            if (s3Zip.success === false) {
                throw new UserError("Failed to upload code for compiling.");
            }

            temporaryFolder = await createTemporaryFolder();

            try {
                debugLogger.debug(`Copy all non dart files to folder ${temporaryFolder}...`);
                await this.#copyNonDartFiles(temporaryFolder);
                debugLogger.debug("Copy all non dart files to folder done.");

                debugLogger.debug("Downloading compiled code...");
                await this.#downloadAndUnzipFromS3ToFolder(s3Zip.downloadUrl, temporaryFolder);
                debugLogger.debug("Finished downloading compiled code...");
            } catch (error) {
                await deleteFolder(temporaryFolder);
                throw error;
            }
        } finally {
            // remove temporary folder
            await deleteFolder(inputTemporaryFolder);
        }

        return {
            ...input,
            path: temporaryFolder,
        };
    }
}
