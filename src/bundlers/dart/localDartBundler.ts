import path from "path";
import Mustache from "mustache";
import { createTemporaryFolder, writeToFile } from "../../utils/file";
import { BundlerInput, BundlerInterface, BundlerOutput } from "../bundler.interface";
import { checkIfDartIsInstalled } from "../../utils/dart";
import { debugLogger } from "../../utils/logging";
import { ClassConfiguration } from "../../models/projectConfiguration";
import { template } from "./localDartMain";
import { default as fsExtra } from "fs-extra";
import { spawnSync } from 'child_process';
import { TriggerType } from "../../models/yamlProjectConfiguration";
import log from "loglevel";

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

    #isParameterNative(type: string): boolean {
        return type == "String" || type == "int" || type == "double" || type == "bool" || type.startsWith("List<") || type.startsWith("Map<");
    }

    async #compile(folderPath: string) {
        const result = spawnSync("dart", ["compile", "exe", "main.dart"], { cwd: folderPath });
        if (result.status != 0) {
            log.info(result.stderr.toString());
            log.info(result.stdout.toString());
            throw new Error("Compilation error! Please check your code and try again.");
        }
    }

    async bundle(input: BundlerInput): Promise<BundlerOutput> {
        // Create a temporary folder were we copy user code to prepare everything.
        const folderPath = input.genezioConfigurationFilePath;
        const inputTemporaryFolder = await createTemporaryFolder()
        await fsExtra.copy(folderPath, inputTemporaryFolder);
        debugLogger.info(`Copy files in temp folder ${inputTemporaryFolder}`);

        // Create the router class
        const userClass = input.projectConfiguration.classes.find((c: ClassConfiguration) => c.path == input.path)!;
        await this.#createRouterFileForClass(userClass, inputTemporaryFolder);

        // Check if dart is installed
        await checkIfDartIsInstalled();

        // Compile the Dart code on the server
        debugLogger.info("Compiling Dart...")
        await this.#compile(inputTemporaryFolder)
        debugLogger.info("Compiling Dart finished.")

        return {
            ...input,
            path: inputTemporaryFolder,
            extra: {
                startingCommand: path.join(inputTemporaryFolder, "main.exe"),
                commandParameters: [],
            }
        };
    }
}
