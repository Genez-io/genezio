import axios from "axios";
import fs from "fs";
import path from "path";
import Mustache from "mustache";
import { getCompileDartPresignedURL } from "../../requests/getCompileDartPresignedURL";
import { uploadContentToS3 } from "../../requests/uploadContentToS3";
import decompress from "decompress";
import { createTemporaryFolder, writeToFile, zipDirectory } from "../../utils/file";
import { BundlerInput, BundlerInterface, BundlerOutput } from "../bundler.interface";
import { checkIfDartIsInstalled } from "../../utils/dart";
import { debugLogger } from "../../utils/logging";
import { ClassConfiguration } from "../../models/projectConfiguration";
import { template } from "./dartMain";
import { default as fsExtra } from "fs-extra";
import { DART_COMPILATION_ENDPOINT } from "../../constants";
import { TriggerType } from "../../models/yamlProjectConfiguration";
import { spawnSync } from "child_process";
import log from "loglevel";
import { runNewProcess } from "../../utils/process";

export class DartBundler implements BundlerInterface {
    async #getDartCompilePresignedUrl(archiveName: string): Promise<string> {
        return await getCompileDartPresignedURL(archiveName)
    }

    async #analyze(path: string) {
        const result = spawnSync("dart", ["analyze"], { cwd: path });

        if (result.status != 0) {
            log.info(result.stdout.toString().split("\n").slice(1).join("\n"));
            throw new Error("Compilation error! Please check your code and try again.");
        }
    }

    #isParameterNative(type: string): boolean {
        return type == "String" || type == "int" || type == "double" || type == "bool";
    }

    async #compile(archiveName: string): Promise<string> {
        const url = DART_COMPILATION_ENDPOINT;

        const response: any = await axios({
            method: "PUT",
            url: url,
            data: { archiveName },
            maxContentLength: Infinity,
            maxBodyLength: Infinity
        }).catch((error: Error) => {
            throw error
        });

        if (response.data.status === "error") {
            throw new Error(response.data.message);
        }

        if (response.data?.error?.message) {
            throw new Error(response.data.error.message);
        }

        return response.data
    }

    async #downloadAndUnzipFromS3ToFolder(s3ZipUrl: string, temporaryFolder: string): Promise<void> {
        const compiledZip = path.join(temporaryFolder, "compiled.zip")

        return await axios({
            url: s3ZipUrl,
            responseType: 'arraybuffer'
        }).then(response => {
            fs.writeFileSync(compiledZip, response.data)
        }).then((async () => {
            await decompress(compiledZip, temporaryFolder)
            fs.unlinkSync(compiledZip)
        })).catch(err => console.error(err));
    }

    async #createRouterFileForClass(classConfiguration: ClassConfiguration, folderPath: string): Promise<void> {
        const moustacheViewForMain = {
            classFileName: path.basename(classConfiguration.path, path.extname(classConfiguration.path)),
            className: classConfiguration.name,
            jsonRpcMethods: classConfiguration.methods
                .filter((m) => m.type === TriggerType.jsonrpc)
                .map((m) => ({
                    name: m.name,
                    parameters: m.parameters.map((p, index) => ({
                        index,
                        isNative: this.#isParameterNative(p.type),
                        last: index == m.parameters.length - 1,
                        type: p.type,
                        cast: p.type == "double" ? ".toDouble()" : p.type == "int" ? ".toInt()" : undefined,
                    })),
                })),
            cronMethods: classConfiguration.methods
                .filter((m) => m.type === TriggerType.cron)
                .map((m) => ({
                    name: m.name,
                    parameters: m.parameters.map((p, index) => ({
                        index,
                        isNative: this.#isParameterNative(p.type),
                        last: index == m.parameters.length - 1,
                        type: p.type,
                        cast: p.type == "double" ? ".toDouble()" : p.type == "int" ? ".toInt()" : undefined,
                    })),
                })),
            httpMethods: classConfiguration.methods
                .filter((m) => m.type === TriggerType.http)
                .map((m) => ({
                    name: m.name,
                    parameters: m.parameters.map((p, index) => ({
                        index,
                        isNative: this.#isParameterNative(p.type),
                        last: index == m.parameters.length - 1,
                        type: p.type,
                        cast: p.type == "double" ? ".toDouble()" : p.type == "int" ? ".toInt()" : undefined,
                    })),
                })),
        }

        const routerFileContent = Mustache.render(template, moustacheViewForMain);
        await writeToFile(folderPath, "main.dart", routerFileContent);
    }

    async #uploadUserCodeToS3(projectName: string, className: string, userCodeFolderPath: string): Promise<string> {
        const random = Math.random().toString(36).substring(2);
        const archiveName = `${projectName}${className}${random}.zip`;
        const presignedUrlResult: any = await this.#getDartCompilePresignedUrl(archiveName)

        const archiveDirectoryOutput = await createTemporaryFolder();
        const archivePath = path.join(archiveDirectoryOutput, archiveName);

        await zipDirectory(userCodeFolderPath, archivePath);
        await uploadContentToS3(presignedUrlResult.presignedURL, archivePath)

        return archiveName;
    }

    async #addLambdaRuntimeDepenendecy(path: string) {
        const success = await runNewProcess("dart pub add aws_lambda_dart_runtime:'^1.0.3+2'", path, false);

        if (!success) {
            throw new Error("Error while adding aws_lambda_dart_runtime dependency");
        }
    }

    async bundle(input: BundlerInput): Promise<BundlerOutput> {
        // Create a temporary folder were we copy user code to prepare everything.
        const folderPath = input.genezioConfigurationFilePath;
        const inputTemporaryFolder = await createTemporaryFolder(input.configuration.name);
        await fsExtra.copy(folderPath, inputTemporaryFolder);
        debugLogger.info(`Copy files in temp folder ${inputTemporaryFolder}`);

        // Create the router class
        const userClass = input.projectConfiguration.classes.find((c: ClassConfiguration) => c.path == input.path)!;
        this.#createRouterFileForClass(userClass, inputTemporaryFolder);

        // Check if dart is installed
        await checkIfDartIsInstalled();

        await this.#addLambdaRuntimeDepenendecy(inputTemporaryFolder);

        await this.#analyze(inputTemporaryFolder);

        const archiveName = await this.#uploadUserCodeToS3(input.projectConfiguration.name, userClass.name, inputTemporaryFolder);

        // Compile the Dart code on the server
        debugLogger.info("Compiling Dart...")
        const s3Zip: any = await this.#compile(archiveName)
        debugLogger.info("Compiling Dart finished.")

        if (s3Zip.success === false) {
            throw new Error("Failed to upload code for compiling.");
        }

        const temporaryFolder = await createTemporaryFolder()
        debugLogger.info("Downloading compiled code...")
        await this.#downloadAndUnzipFromS3ToFolder(s3Zip.downloadUrl, temporaryFolder)
        debugLogger.info("Finished downloading compiled code...")

        return {
            ...input,
            path: temporaryFolder,
        };
    }
}