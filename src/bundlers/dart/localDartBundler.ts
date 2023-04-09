import path from "path";
import Mustache from "mustache";
import { createTemporaryFolder, writeToFile, zipDirectory } from "../../utils/file";
import { BundlerInput, BundlerInterface, BundlerOutput } from "../bundler.interface";
import { isDartInstalled } from "../../utils/dart";
import { debugLogger } from "../../utils/logging";
import { ClassConfiguration } from "../../models/projectConfiguration";
import { template } from "./localDartMain";
import { default as fsExtra } from "fs-extra";
import { execSync } from 'child_process';
import { TriggerType } from "../../models/yamlProjectConfiguration";

export class DartBundler implements BundlerInterface {

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
                        isNative: p.type == "String" || p.type == "int" || p.type == "double" || p.type == "bool",
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
                        isNative: p.type == "String" || p.type == "int" || p.type == "double" || p.type == "bool",
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
                        isNative: p.type == "String" || p.type == "int" || p.type == "double" || p.type == "bool",
                        last: index == m.parameters.length - 1,
                        type: p.type,
                        cast: p.type == "double" ? ".toDouble()" : p.type == "int" ? ".toInt()" : undefined,
                    })),
                })),
        }

        const routerFileContent = Mustache.render(template, moustacheViewForMain);
        await writeToFile(folderPath, "main.dart", routerFileContent);
    }

    async #compile(folderPath: string) {
        const output = execSync("dart compile exe main.dart", { cwd: folderPath });
        console.log(output.toString());
    }

    async bundle(input: BundlerInput): Promise<BundlerOutput> {
        // Create a temporary folder were we copy user code to prepare everything.
        const folderPath = input.genezioConfigurationFilePath;
        const inputTemporaryFolder = await createTemporaryFolder()
        await fsExtra.copy(folderPath, inputTemporaryFolder);
        console.log(inputTemporaryFolder);

        // Create the router class
        const userClass = input.projectConfiguration.classes.find((c: ClassConfiguration) => c.path == input.path)!;
        await this.#createRouterFileForClass(userClass, inputTemporaryFolder);

        // Check if dart is installed
        const dartIsInstalled = isDartInstalled();
        if (!dartIsInstalled) {
            // TODO write a better error message
            throw new Error("Dart is not installed.")
        }

        // Compile the Dart code on the server
        debugLogger.info("Compiling Dart...")
        await this.#compile(inputTemporaryFolder)
        debugLogger.info("Compiling Dart finished.")

        return {
            ...input,
            path: inputTemporaryFolder,
        };
    }
}