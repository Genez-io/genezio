import { generateAst } from "./astGeneratorHandler.js";
import { generateSdk } from "./sdkGeneratorHandler.js";
import {
    AstNodeType,
    ClassDefinition,
    MethodDefinition,
    ResponseType,
    SdkClassConfiguration,
    SdkGeneratorInput,
    SdkGeneratorOutput,
} from "../models/genezioModels.js";
import { SdkGeneratorResponse } from "../models/sdkGeneratorResponse.js";
import { AstGeneratorInput } from "../models/genezioModels.js";
import fs from "fs";
import { Language, TriggerType } from "../yamlProjectConfiguration/models.js";
import path from "path";
import { YamlClass } from "../yamlProjectConfiguration/v2.js";
import { INVALID_HTTP_METHODS_FOUND, UserError } from "../errors.js";
import colors from "colors";

/**
 * Asynchronously handles a request to generate an SDK based on the provided YAML project configuration.
 *
 * @param {Language} language - The language to generate the SDK in.
 * @param {SdkClassConfiguration[]} classes - The classes to generate the SDK for.
 * @param {string} backendPath - The path to the backend directory.
 * @returns {Promise<SdkGeneratorResponse>} A Promise that resolves with the response to the SDK generation request.
 * @throws {Error} If there was an error generating the SDK.
 */
export async function sdkGeneratorApiHandler(
    language: Language,
    classes: SdkClassConfiguration[],
    backendPath: string,
    packageName?: string,
    packageVersion?: string,
): Promise<SdkGeneratorResponse> {
    const inputs: AstGeneratorInput[] = generateAstInputs(classes || [], backendPath);

    const sdkGeneratorInput: SdkGeneratorInput = {
        packageName,
        packageVersion,
        classesInfo: [],
        language: language ?? "ts",
    };

    let invalidHttpMethods: MethodDefinition[] = [];
    let invalidHttpMethodsString = "";
    // iterate over each class file
    for (const input of inputs) {
        // Generate genezio AST from file
        const astGeneratorOutput = await generateAst(
            input,
            // TODO: Add AST generator plugin support
            [],
        );

        // prepare input for sdkGenerator
        const classConfiguration = classes.find((c) => c.path === input.class.path);
        if (!classConfiguration) {
            throw new UserError(
                `[Sdk Generator] Class configuration not found for ${input.class.path}`,
            );
        }

        if (astGeneratorOutput.program.body !== undefined) {
            const astClassDefinition = astGeneratorOutput.program.body.find(
                (node) =>
                    node.type === AstNodeType.ClassDefinition &&
                    (node as ClassDefinition).name === classConfiguration.name,
            ) as ClassDefinition;
            const currentInvalidHttpMethods = checkInvalidHttpMethods(
                classConfiguration,
                astClassDefinition,
                language,
            );
            invalidHttpMethods = invalidHttpMethods.concat(currentInvalidHttpMethods.methods);
            invalidHttpMethodsString += currentInvalidHttpMethods.methodsString;
        }

        sdkGeneratorInput.classesInfo.push({
            program: astGeneratorOutput.program,
            classConfiguration,
            fileName: path.basename(input.class.path),
        });
    }
    if (invalidHttpMethods.length > 0) {
        throw new UserError(INVALID_HTTP_METHODS_FOUND(invalidHttpMethodsString));
    }

    const sdkOutput: SdkGeneratorOutput = await generateSdk(
        sdkGeneratorInput,
        // TODO: Add SDK generator plugin support
        [],
    );

    return {
        files: sdkOutput.files,
        sdkGeneratorInput: sdkGeneratorInput,
    };
}

function checkInvalidHttpMethods(
    sdkClass: SdkClassConfiguration,
    astClass: ClassDefinition,
    language: Language,
): { methods: MethodDefinition[]; methodsString: string } {
    const methods: MethodDefinition[] = [];
    let methodsString = "";
    switch (language) {
        case "ts":
            for (const method of sdkClass.methods) {
                if (method.type === TriggerType.http) {
                    const astMethod = astClass.methods.find((m) => m.name === method.name);
                    if (
                        astMethod &&
                        (astMethod.params.length != 1 ||
                            astMethod.params[0].paramType.type != AstNodeType.RequestType ||
                            astMethod.params[0].paramType.name != "Request" ||
                            astMethod.params[0].optional != false ||
                            astMethod.returnType.type != AstNodeType.PromiseType ||
                            astMethod.returnType.generic.type != AstNodeType.ResponseType ||
                            (astMethod.returnType.generic as ResponseType).name != "Response")
                    ) {
                        methods.push(astMethod);
                        methodsString +=
                            ` ${colors.red(`- ${astClass.name}.${astMethod.name}`)}` + "\n";
                    }
                }
            }
            return { methods, methodsString };
        default:
            methodsString = "";
            for (const method of sdkClass.methods) {
                if (method.type === TriggerType.http) {
                    const astMethod = astClass.methods.find((m) => m.name === method.name);
                    if (
                        astMethod &&
                        (astMethod.params.length != 1 ||
                            astMethod.params[0].paramType.type != AstNodeType.RequestType ||
                            astMethod.params[0].paramType.name != "Request" ||
                            astMethod.params[0].optional != false ||
                            astMethod.returnType.type != AstNodeType.PromiseType ||
                            astMethod.returnType.generic.type != AstNodeType.ResponseType ||
                            (astMethod.returnType.generic as ResponseType).name != "Response")
                    ) {
                        methods.push(astMethod);
                        methodsString +=
                            ` ${colors.red(`- ${astClass.name}.${astMethod.name}`)}` + "\n";
                    }
                }
            }
            return { methods, methodsString };
    }
}

export function mapYamlClassToSdkClassConfiguration(
    classes: YamlClass[],
    language: Language,
    rootPath: string,
): SdkClassConfiguration[] {
    return classes.map((yamlClass) => {
        return {
            name: yamlClass.name,
            path: path.join(rootPath, yamlClass.path),
            language,
            type: yamlClass.type || TriggerType.jsonrpc,
            methods: (yamlClass.methods || []).map((m) => ({ name: m.name, type: m.type })),
        };
    });
}

export function generateAstInputs(
    classes: SdkClassConfiguration[],
    root: string,
): AstGeneratorInput[] {
    const astGeneratorInputs: AstGeneratorInput[] = [];

    for (const classFile of classes) {
        // read file from classFile.path
        const data = fs.readFileSync(classFile.path, "utf-8");

        astGeneratorInputs.push({
            class: {
                path: classFile.path,
                data,
                name: classFile.name,
            },
            root,
        });
    }

    return astGeneratorInputs;
}
