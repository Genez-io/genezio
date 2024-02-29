import path from "path";
import Mustache from "mustache";
import { createTemporaryFolder, deleteFolder, writeToFile } from "../../utils/file.js";
import { BundlerInput, BundlerInterface, BundlerOutput } from "../bundler.interface.js";
import { checkIfDartIsInstalled } from "../../utils/dart.js";
import { debugLogger } from "../../utils/logging.js";
import {
    ClassConfiguration,
    MethodConfiguration,
    ParameterType,
} from "../../models/projectConfiguration.js";
import { template } from "./localDartMain.js";
import { default as fsExtra } from "fs-extra";
import { spawnSync } from "child_process";
import { TriggerType } from "../../yamlProjectConfiguration/models.js";
import log from "loglevel";
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

export class DartBundler implements BundlerInterface {
    async #analyze(path: string) {
        const result = spawnSync("dart", ["analyze", "--no-fatal-warnings"], {
            cwd: path,
        });

        if (result.status != 0) {
            log.info(result.stdout.toString().split("\n").slice(1).join("\n"));

            // Delete the temporary folder if the compilation fails
            await deleteFolder(path);

            throw new Error("Compilation error! Please check your code and try again.");
        }
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
            .find((m) => m.name == method.name)!
            .params.find((p) => p.name == parameterType.name);
        return `${this.#castParameterToPropertyType(type!.paramType, `params[${index}]`)}`;
    }

    async #createRouterFileForClass(
        classConfiguration: ClassConfiguration,
        ast: Program,
        folderPath: string,
    ): Promise<void> {
        const mainClass = ast.body?.find((element) => {
            return (
                element.type === AstNodeType.ClassDefinition &&
                (element as ClassDefinition).name === classConfiguration.name
            );
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

    async #compile(folderPath: string) {
        const result = spawnSync("dart", ["compile", "exe", "main.dart"], {
            cwd: folderPath,
        });
        if (result.status != 0) {
            log.info(result.stderr.toString());
            log.info(result.stdout.toString());

            // Delete the temporary folder if the compilation fails
            await deleteFolder(folderPath);

            throw new Error("Compilation error! Please check your code and try again.");
        }
    }

    async bundle(input: BundlerInput): Promise<BundlerOutput> {
        // Create a temporary folder were we copy user code to prepare everything.
        const folderPath = input.genezioConfigurationFilePath;
        const inputTemporaryFolder = await createTemporaryFolder();
        await fsExtra.copy(folderPath, inputTemporaryFolder);
        debugLogger.info(`Copy files in temp folder ${inputTemporaryFolder}`);

        // Create the router class
        const userClass = input.projectConfiguration.classes.find(
            (c: ClassConfiguration) => c.path == input.path,
        )!;
        await this.#createRouterFileForClass(userClass, input.ast, inputTemporaryFolder);

        // Check if dart is installed
        await checkIfDartIsInstalled();

        // Analyze the Dart code on the server
        await this.#analyze(inputTemporaryFolder);

        // Compile the Dart code on the server
        debugLogger.info("Compiling Dart...");
        await this.#compile(inputTemporaryFolder);
        debugLogger.info("Compiling Dart finished.");

        return {
            ...input,
            path: inputTemporaryFolder,
            extra: {
                ...input.extra,
                startingCommand: path.join(inputTemporaryFolder, "main.exe"),
                commandParameters: [],
            },
        };
    }
}
