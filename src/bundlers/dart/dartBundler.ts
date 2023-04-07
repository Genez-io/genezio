import axios from "axios";
import fs from "fs";
import path from "path";
import Mustache from "mustache";
import { getCompileDartPresignedURL } from "../../requests/getCompileDartPresignedURL";
import { uploadContentToS3 } from "../../requests/uploadContentToS3";
import decompress from "decompress";
import { createTemporaryFolder, writeToFile, zipDirectory } from "../../utils/file";
import { BundlerInput, BundlerInterface, BundlerOutput } from "../bundler.interface";
import { getDartSdkVersion, isDartInstalled } from "../../utils/dart";
import { debugLogger } from "../../utils/logging";
import { ClassConfiguration } from "../../models/projectConfiguration";
import { template } from "./dartMain";
import { default as fsExtra } from "fs-extra";

export class DartBundler implements BundlerInterface {
    async #getDartCompilePresignedUrl(archiveName: string): Promise<string> {
        return await getCompileDartPresignedURL(archiveName)
    }

    async #compile(archiveName: string): Promise<string> {
        const url = "https://ns3o2vemuslucddgnznrcrowfu0exevc.lambda-url.us-east-1.on.aws"

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
        console.log(s3ZipUrl);

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

    async bundle(input: BundlerInput): Promise<BundlerOutput> {
        const folderPath = input.genezioConfigurationFilePath;
        const inputTemporaryFolder = await createTemporaryFolder()
        await fsExtra.copy(folderPath, inputTemporaryFolder);

        // TODO: I have to populate the class with a main.dart that does the routing.
        // input.projectConfiguration.classes.
        const userClass = input.projectConfiguration.classes.find((c: ClassConfiguration) => c.path == input.path)!;

        // TODO check if method parameter is Map or List or Enum => throw error.
        // TODO check if return type is Enum => throw error.

        console.log(JSON.stringify(userClass));
        const moustacheViewForMain = {
            classFileName: path.basename(input.path, path.extname(input.path)),
            className: userClass.name,
            methods: userClass.methods.map((m) => ({
                name: m.name,
                parameters: m.parameters.map((p, index) => ({
                    index,
                    isNative: p.type == "String" || p.type == "int" || p.type == "double" || p.type == "bool",
                    last: index == m.parameters.length - 1,
                    type: p.type,
                })),
            })),
        }

        const routerFileContent = Mustache.render(template, moustacheViewForMain);
        await writeToFile(inputTemporaryFolder, "main.dart", routerFileContent);
        console.log("PATH", input.path, inputTemporaryFolder);

        const dartIsInstalled = isDartInstalled();

        if (!dartIsInstalled) {
            throw new Error("Dart is not installed.")
        }

        const random = Math.random().toString(36).substring(2);
        const archiveName = `${input.projectConfiguration.name}${input.configuration.name}${random}.zip`;

        const archiveDirectoryOutput = await createTemporaryFolder();
        const archivePath = path.join(archiveDirectoryOutput, archiveName);

        console.log("Zip ",inputTemporaryFolder, "to", archivePath);
        
        await zipDirectory(inputTemporaryFolder, archivePath);

        const presignedUrlResult: any = await this.#getDartCompilePresignedUrl(archiveName)

        await uploadContentToS3(presignedUrlResult.presignedURL, archivePath)

        debugLogger.info("Compiling Dart...")
        const s3Zip: any = await this.#compile(archiveName)
        debugLogger.info("Compiling Dart finished.")

        if (s3Zip.success === false) {
            // TODO cry
        }

        const temporaryFolder = await createTemporaryFolder()
        debugLogger.info("Downloading compiled code...")
        await this.#downloadAndUnzipFromS3ToFolder(s3Zip.downloadUrl, temporaryFolder)
        debugLogger.info("Finished downloading...")

        return {
            ...input,
            path: temporaryFolder,
        };
    }
}