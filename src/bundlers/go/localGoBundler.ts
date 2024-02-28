import path from "path";
import Mustache from "mustache";
import { default as fsExtra } from "fs-extra";
import log from "loglevel";
import { spawnSync } from "child_process";
import { template } from "./localGoMain.js";
// Utils
import { createTemporaryFolder, writeToFile } from "../../utils/file.js";
import { debugLogger } from "../../utils/logging.js";

// Models
import { BundlerInput, BundlerInterface, BundlerOutput } from "../bundler.interface.js";
import {
    ClassConfiguration,
    MethodConfiguration,
    ParameterType,
} from "../../models/projectConfiguration.js";
import {
    ArrayType,
    AstNodeType,
    ClassDefinition,
    CustomAstNodeType,
    MapType,
    Node,
    Program,
    StructLiteral,
} from "../../models/genezioModels.js";
import { checkIfGoIsInstalled } from "../../utils/go.js";
import { TriggerType } from "../../yamlProjectConfiguration/models.js";

type ImportView = {
    name: string;
    path: string;
    named: boolean;
};

type MoustanceViewForMain = {
    imports: ImportView[];
    class: {
        name: string;
        packageName: string | undefined;
    };
    cronMethods: {
        name: string;
    }[];
    httpMethods: {
        name: string;
    }[];
    jsonRpcMethods: {
        name: string;
        parameters: {
            index: number;
            cast: string;
        }[];
    }[];
};

export class GoBundler implements BundlerInterface {
    #getImportViewFromPath(path: string): ImportView {
        if (!path) return { name: "", path: "", named: false };
        const packageName = path.substring(path.lastIndexOf("/") + 1);
        const pathWithoutName = path.substring(0, path.lastIndexOf("/"));
        const packagePath = pathWithoutName.substring(pathWithoutName.lastIndexOf("/") + 1);
        if (packageName === packagePath)
            return { name: packageName, path: pathWithoutName, named: false };
        return { name: packageName, path: pathWithoutName, named: true };
    }

    #mapTypeToGoType(type: Node, ast: Program, imports: ImportView[]): string {
        switch (type.type) {
            case AstNodeType.StringLiteral:
                return "string";
            case AstNodeType.DoubleLiteral:
                return "float64";
            case AstNodeType.BooleanLiteral:
                return "bool";
            case AstNodeType.IntegerLiteral:
                return "int";
            case AstNodeType.CustomNodeLiteral:
                for (const node of ast.body ?? []) {
                    if (node.type === AstNodeType.StructLiteral) {
                        const struct = node as StructLiteral;
                        if (struct.name === (type as CustomAstNodeType).rawValue) {
                            const importView = this.#getImportViewFromPath(struct.path ?? "");
                            // check if import is already present
                            if (!imports.find((i) => i.path === importView.path)) {
                                imports.push(importView);
                            }
                            return importView.name + "." + struct.name;
                        }
                    }
                }
                return (type as CustomAstNodeType).rawValue;
            case AstNodeType.ArrayType:
                return "[]" + this.#mapTypeToGoType((type as ArrayType).generic, ast, imports);
            case AstNodeType.MapType:
                return `map[${this.#mapTypeToGoType((type as MapType).genericKey, ast, imports)}]${this.#mapTypeToGoType((type as MapType).genericValue, ast, imports)}`;
            case AstNodeType.AnyLiteral:
                return "interface{}";
        }
        return "interface{}";
    }

    #getCastExpression(
        index: number,
        parameter: ParameterType,
        ast: Program,
        imports: ImportView[],
    ): string {
        switch (parameter.type.type) {
            case AstNodeType.StringLiteral:
            case AstNodeType.DoubleLiteral:
            case AstNodeType.BooleanLiteral:
                if (parameter.optional) {
                    return `var param${index} *${this.#mapTypeToGoType(
                        parameter.type,
                        ast,
                        imports,
                    )}
        if body.Params[${index}] == nil {
            param${index} = nil
        } else {
            paramValue${index} := body.Params[${index}].(${this.#mapTypeToGoType(
                parameter.type,
                ast,
                imports,
            )})
            param${index} = &paramValue${index}
        }`;
                }
                return `param${index} := body.Params[${index}].(${this.#mapTypeToGoType(
                    parameter.type,
                    ast,
                    imports,
                )})`;
            case AstNodeType.IntegerLiteral:
                if (parameter.optional) {
                    return `var param${index} *${this.#mapTypeToGoType(
                        parameter.type,
                        ast,
                        imports,
                    )}
        if body.Params[${index}] == nil {
            param${index} = nil
        } else {
            paramValue${index} := body.Params[${index}].(float64)
            paramValueInt${index} := int(paramValue${index})
            param${index} = &paramValueInt${index}
        }`;
                }
                return `paramFloat${index} := body.Params[${index}].(float64)
        param${index} := int(paramFloat${index})`;
            case AstNodeType.MapType:
            case AstNodeType.CustomNodeLiteral:
            case AstNodeType.ArrayType:
                return `var param${index} ${parameter.optional ? "*" : ""}${this.#mapTypeToGoType(
                    parameter.type,
                    ast,
                    imports,
                )}
        jsonMap, err := json.Marshal(body.Params[${index}])
        if err != nil {
            sendError(w, err)
            return
        }
        err = json.Unmarshal(jsonMap, &param${index})
        if err != nil {
            sendError(w, err)
            return
        }`;
            case AstNodeType.AnyLiteral:
                return `param${index} := body.Params[${index}]`;
        }
        return "";
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
        const classConfigPath = path.dirname(classConfiguration.path);

        // Error check: User is using Windows but paths are unix style (possible when cloning projects from git)
        if (process.platform === "win32" && classConfigPath.includes("/")) {
            throw new Error(
                "Error: You are using Windows but your project contains unix style paths. Please use Windows style paths in genezio.yaml instead.",
            );
        }

        const imports: ImportView[] = [];

        const moustacheViewForMain: MoustanceViewForMain = {
            imports: [],
            class: {
                name: mainClass.name,
                packageName: mainClass.path?.substring(mainClass.path.lastIndexOf(path.sep) + 1),
            },
            cronMethods: classConfiguration.methods
                .filter((m) => m.type === TriggerType.cron)
                .map((m: MethodConfiguration) => ({
                    name: m.name,
                })),
            jsonRpcMethods: classConfiguration.methods
                .filter((m) => m.type === TriggerType.jsonrpc)
                .map((m: MethodConfiguration) => ({
                    name: m.name,
                    isVoid: m.returnType.type === AstNodeType.VoidLiteral,
                    parameters: m.parameters.map((p, index) => ({
                        index,
                        last: index === m.parameters.length - 1,
                        cast: this.#getCastExpression(index, p, ast, imports),
                    })),
                })),
            httpMethods: classConfiguration.methods
                .filter((m) => m.type === TriggerType.http)
                .map((m: MethodConfiguration) => ({
                    name: m.name,
                })),
        };

        moustacheViewForMain.imports.push(...imports);
        const classImport = this.#getImportViewFromPath(mainClass.path ?? "");
        if (!moustacheViewForMain.imports.find((i) => i.path === classImport.path)) {
            moustacheViewForMain.imports.push(classImport);
        }

        const routerFileContent = Mustache.render(template, moustacheViewForMain);
        await writeToFile(folderPath, "main.go", routerFileContent);
    }

    async #compile(folderPath: string) {
        // Compile the Go code locally
        const getDependencyResult = spawnSync("go", ["get", "github.com/Genez-io/genezio_types"], {
            cwd: folderPath,
        });
        if (getDependencyResult.status == null) {
            log.info(
                "There was an error while running the go script, make sure you have the correct permissions.",
            );
            throw new Error("Compilation error! Please check your code and try again.");
        } else if (getDependencyResult.status != 0) {
            log.info(getDependencyResult.stderr.toString());
            log.info(getDependencyResult.stdout.toString());
            throw new Error("Compilation error! Please check your code and try again.");
        }
        const result = spawnSync("go", ["build", "-o", "main", "main.go"], {
            cwd: folderPath,
        });
        if (result.status == null) {
            log.info(
                "There was an error while running the go script, make sure you have the correct permissions.",
            );
            throw new Error("Compilation error! Please check your code and try again.");
        } else if (result.status != 0) {
            log.info(result.stderr.toString());
            log.info(result.stdout.toString());
            throw new Error("Compilation error! Please check your code and try again.");
        }
    }

    async bundle(input: BundlerInput): Promise<BundlerOutput> {
        // Create a temporary folder were we copy user code to prepare everything.
        const folderPath =
            input.projectConfiguration.workspace?.backend ?? input.genezioConfigurationFilePath;
        const inputTemporaryFolder = await createTemporaryFolder();
        await fsExtra.copy(folderPath, inputTemporaryFolder);
        debugLogger.info(`Copy files in temp folder ${inputTemporaryFolder}`);

        // Create the router class
        const userClass = input.projectConfiguration.classes.find(
            (c: ClassConfiguration) => c.path == input.path,
        )!;
        await this.#createRouterFileForClass(userClass, input.ast, inputTemporaryFolder);

        checkIfGoIsInstalled();

        // Compile the Go code on the server
        debugLogger.info("Compiling Go...");
        await this.#compile(inputTemporaryFolder);
        debugLogger.info("Compiling Go finished.");

        return {
            ...input,
            path: inputTemporaryFolder,
            extra: {
                ...input.extra,
                startingCommand: path.join(inputTemporaryFolder, "main"),
                commandParameters: [],
            },
        };
    }
}
