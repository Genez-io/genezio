import path from "path";
import Mustache from "mustache";
import { default as fsExtra } from "fs-extra";
import log from "loglevel";
import { spawnSync } from "child_process";
import { template } from "./goMain.js";
// Utils
import { createTemporaryFolder, writeToFile } from "../../utils/file.js";
import { debugLogger } from "../../utils/logging.js";

// Models
import { BundlerInput, BundlerInterface, BundlerOutput } from "../bundler.interface.js";
import { ClassConfiguration } from "../../models/projectConfiguration.js";
import {
    ArrayType,
    AstNodeType,
    ClassDefinition,
    CustomAstNodeType,
    MethodDefinition,
    Node,
    ParameterDefinition,
    Program,
    StructLiteral,
} from "../../models/genezioModels.js";
import { checkIfGoIsInstalled } from "../../utils/go.js";

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
        }
        return "interface{}";
    }

    #getCastExpression(
        index: number,
        parameter: ParameterDefinition,
        ast: Program,
        imports: ImportView[],
    ): string {
        switch (parameter.paramType.type) {
            case AstNodeType.StringLiteral:
            case AstNodeType.DoubleLiteral:
            case AstNodeType.BooleanLiteral:
                if (parameter.optional) {
                    return `var param${index} *${this.#mapTypeToGoType(
                        parameter.paramType,
                        ast,
                        imports,
                    )}
        if body.Params[${index}] == nil {
            param${index} = nil
        } else {
            paramValue${index} := body.Params[${index}].(${this.#mapTypeToGoType(
                parameter.paramType,
                ast,
                imports,
            )})
            param${index} = &paramValue${index}
        }`;
                }
                return `param${index} := body.Params[${index}].(${this.#mapTypeToGoType(
                    parameter.paramType,
                    ast,
                    imports,
                )})`;
            case AstNodeType.IntegerLiteral:
                if (parameter.optional) {
                    return `var param${index} *${this.#mapTypeToGoType(
                        parameter.paramType,
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
            case AstNodeType.CustomNodeLiteral:
            case AstNodeType.ArrayType:
                return `var param${index} ${parameter.optional ? "*" : ""}${this.#mapTypeToGoType(
                    parameter.paramType,
                    ast,
                    imports,
                )}
        jsonMap, err := json.Marshal(body.Params[${index}])
        if err != nil {
            errorResponse := sendError(err)
            return errorResponse, nil
        }
        err = json.Unmarshal(jsonMap, &param${index})
        if err != nil {
            errorResponse := sendError(err)
            return errorResponse, nil
        }`;
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
            jsonRpcMethods: mainClass.methods.map((m: MethodDefinition) => ({
                name: m.name,
                isVoid: m.returnType.type === AstNodeType.VoidLiteral,
                parameters: m.params.map((p, index) => ({
                    index,
                    last: index === m.params.length - 1,
                    cast: this.#getCastExpression(index, p, ast, imports),
                })),
            })),
        };

        moustacheViewForMain.imports.push(this.#getImportViewFromPath(mainClass.path ?? ""));
        moustacheViewForMain.imports.push(...imports);

        const routerFileContent = Mustache.render(template, moustacheViewForMain);
        await writeToFile(folderPath, "main.go", routerFileContent);
    }

    async #compile(folderPath: string) {
        // Compile the Go code locally
        const getDependencyResult = spawnSync(
            "go",
            ["get", "github.com/aws/aws-lambda-go/lambda"],
            {
                cwd: folderPath,
            },
        );
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
        process.env["GOOS"] = "linux";
        process.env["GOARCH"] = "arm64";
        const result = spawnSync("go", ["build", "-o", "bootstrap", "main.go"], {
            cwd: folderPath,
            env: {
                ...process.env,
            },
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
        const folderPath = input.genezioConfigurationFilePath;
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
        };
    }
}
