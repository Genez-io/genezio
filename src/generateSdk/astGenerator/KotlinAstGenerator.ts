import os from "os";
import path from "path";
import fs from "fs";
import {
    AstGeneratorInterface,
    AstGeneratorInput,
    ClassDefinition,
    AstNodeType,
    MethodKindEnum,
    SourceType,
    AstGeneratorOutput,
    StructLiteral,
    Node,
    MethodDefinition,
    DoubleType,
    IntegerType,
    StringType,
    BooleanType,
    FloatType,
    AnyType,
    CustomAstNodeType,
    ArrayType,
    PromiseType,
    MapType,
    VoidType,
} from "../../models/genezioModels.js";
import { checkIfKotlinReqsAreInstalled } from "../../utils/kotlin.js";
import { createTemporaryFolder, fileExists } from "../../utils/file.js";
import { runNewProcess, runNewProcessWithResult } from "../../utils/process.js";
import { PropertyDefinition } from "../../models/genezioModels.js";
import { default as fsExtra } from "fs-extra";

interface KotlinAstParameterDefinition {
    paramName: string;
    paramType: string;
}
interface KotlinAstMethodDefinition {
    funcName: string;
    funcRetType: string;
    funcParams: KotlinAstParameterDefinition[];
}
interface KotlinAstClassDescription {
    className: string;
    classConstructor: KotlinAstParameterDefinition[];
    classMethods: KotlinAstMethodDefinition[];
}
interface KotlinAstGeneratorOutput {
    projectClasses: Map<string, KotlinAstClassDescription>;
}
export class AstGenerator implements AstGeneratorInterface {
    async #compileGenezioKotlinAstExtractor() {
        const folder = await createTemporaryFolder();
        const ast_clone_success = await runNewProcess(
            "git clone --quiet https://github.com/Genez-io/kotlin-ast.git .",
            folder,
        );
        if (!ast_clone_success) {
            throw new Error(
                "Error: Failed to clone Kotlin AST parser repository to " +
                    folder +
                    " temporary folder!",
            );
        }

        const gradlew = "." + path.sep + "gradlew" + (os.platform() === "win32" ? ".bat" : "");
        const gradle_build_success = await runNewProcess(gradlew + " --quiet fatJar", folder);
        if (!gradle_build_success) {
            throw new Error(
                'Error: Failed to build Kotlin AST parser while executing "./gradlew --quiet fatJar" in ' +
                    folder +
                    " temporary folder!",
            );
        }

        if (!fs.existsSync(path.join(os.homedir(), ".kotlin_ast_generator"))) {
            fs.mkdirSync(path.join(os.homedir(), ".kotlin_ast_generator"));
        }

        const ast_gen_path = path.join(folder, "app", "build", "libs", "app-standalone.jar");
        const ast_gen_dest = path.join(os.homedir(), ".kotlin_ast_generator", "ast-generator.jar");
        fsExtra.copyFileSync(ast_gen_path, ast_gen_dest);
    }

    #parseList(type: string): ArrayType | undefined {
        const listToken = "List<";
        if (type.startsWith(listToken)) {
            const extractedString = type.substring(listToken.length, type.length - 1);
            return {
                type: AstNodeType.ArrayType,
                generic: this.#mapTypesToParamType(extractedString),
            };
        } else {
            return undefined;
        }
    }

    #parseMap(type: string): MapType | undefined {
        const mapToken = "Map<";
        if (type.startsWith(mapToken)) {
            const cleanedType = type.replace(" ", "");
            const extractedString = cleanedType.substring(mapToken.length, cleanedType.length - 1);
            const components = extractedString.split(",");
            const key = components[0];
            const value = components.slice(1).join(",");

            return {
                type: AstNodeType.MapType,
                genericKey: this.#mapTypesToParamType(key),
                genericValue: this.#mapTypesToParamType(value),
            };
        }
    }

    // TODO: research Kotlin equivalent
    // eg: "suspend fun funcName()" alongside "launch{}" is usually used instead of "PromiseType"
    #parseCoroutine(type: string): PromiseType | undefined {
        const promiseToken = "Future<";
        if (type.startsWith(promiseToken)) {
            const extractedString = type.substring(promiseToken.length, type.length - 1);
            return {
                type: AstNodeType.PromiseType,
                generic: this.#mapTypesToParamType(extractedString),
            };
        }
    }

    #mapTypesToParamType(
        type: string,
    ):
        | DoubleType
        | IntegerType
        | StringType
        | BooleanType
        | FloatType
        | AnyType
        | ArrayType
        | MapType
        | CustomAstNodeType
        | VoidType {
        const list = this.#parseList(type);
        if (list) {
            return list;
        }

        const map = this.#parseMap(type);
        if (map) {
            return map;
        }

        switch (type) {
            case "String":
                return {
                    type: AstNodeType.StringLiteral,
                };
            case "Int":
                return {
                    type: AstNodeType.IntegerLiteral,
                };
            case "Double":
                return {
                    type: AstNodeType.DoubleLiteral,
                };
            case "Boolean":
                return {
                    type: AstNodeType.BooleanLiteral,
                };
            case "Void": {
                return {
                    type: AstNodeType.VoidLiteral,
                };
            }
            case "Any":
                return {
                    type: AstNodeType.AnyLiteral,
                };
            default:
                return {
                    type: AstNodeType.CustomNodeLiteral,
                    rawValue: type,
                };
        }
    }

    async generateAst(input: AstGeneratorInput): Promise<AstGeneratorOutput> {
        // Check if java sdk, kotlin and gradle are installed
        checkIfKotlinReqsAreInstalled();

        // Check if the kotlin ast extractor is compiled and installed in home.
        const genezioAstGeneratorPath = path.join(
            os.homedir(),
            ".kotlin_ast_generator",
            "ast-generator.jar",
        );
        const compiled = await fileExists(genezioAstGeneratorPath);
        if (!compiled) {
            await this.#compileGenezioKotlinAstExtractor();
        }

        // Run the Kotlin AST generator program
        const classAbsolutePath = path.resolve(input.class.path);
        const result = await runNewProcessWithResult(
            `java -jar ${genezioAstGeneratorPath} ${classAbsolutePath}`,
        );
        // Map serialization workaround because JavaScript...
        const ast: KotlinAstGeneratorOutput = {
            projectClasses: {} as Map<string, KotlinAstClassDescription>,
        };
        ast.projectClasses = new Map(Object.entries(JSON.parse(result).projectClasses));

        // Convert the Kotlin AST to Genezio AST
        const mainClass = ast.projectClasses.get(
            input.class.name || "",
        ) as KotlinAstClassDescription;

        if (!mainClass) {
            throw new Error(
                `No class named ${input.class.name} found. Check in the 'genezio.yaml' file and make sure the path is correct.`,
            );
        }

        const genezioClass: ClassDefinition = {
            type: AstNodeType.ClassDefinition,
            name: mainClass.className,
            methods: mainClass.classMethods.map((m: KotlinAstMethodDefinition) => {
                return {
                    type: AstNodeType.MethodDefinition,
                    name: m.funcName,
                    params: m.funcParams.map((p: KotlinAstParameterDefinition) => {
                        return {
                            type: AstNodeType.ParameterDefinition,
                            name: p.paramName,
                            paramType: this.#mapTypesToParamType(p.paramType),
                            rawType: p.paramType,
                        };
                    }),
                    returnType: this.#mapTypesToParamType(m.funcRetType),
                    static: false,
                    kind: MethodKindEnum.method,
                } as MethodDefinition;
            }),
        };

        const body: [Node] = [genezioClass];

        // Parse other data classes
        ast.projectClasses.forEach((c: KotlinAstClassDescription) => {
            // Skip main class defined earlier
            if (c.className === mainClass.className) {
                return;
            }

            const genezioClass: StructLiteral = {
                type: AstNodeType.StructLiteral,
                name: c.className,
                path: c.className,
                typeLiteral: {
                    type: AstNodeType.TypeLiteral,
                    properties: c.classConstructor.map((p: KotlinAstParameterDefinition) => {
                        return {
                            name: p.paramName,
                            type: this.#mapTypesToParamType(p.paramType),
                            rawType: p.paramType,
                            optional: false,
                        } as PropertyDefinition;
                    }),
                },
            };
            body.push(genezioClass);
        });

        return {
            program: {
                body,
                originalLanguage: "kotlin",
                sourceType: SourceType.module,
            },
        };
    }
}

const supportedExtensions = ["kt"];

export default { supportedExtensions, AstGenerator };
