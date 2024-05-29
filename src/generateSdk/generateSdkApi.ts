import { generateAst } from "./astGeneratorHandler.js";
import { generateSdk } from "./sdkGeneratorHandler.js";
import {
    SdkClassConfiguration,
    SdkGeneratorClassesInfoInput,
    SdkGeneratorInput,
} from "../models/genezioModels.js";
import { SdkGeneratorResponse, SdkHandlerResponse } from "../models/sdkGeneratorResponse.js";
import { AstGeneratorInput } from "../models/genezioModels.js";
import fs from "fs";
import { Language, TriggerType } from "../yamlProjectConfiguration/models.js";
import path from "path";
import { YamlClass } from "../yamlProjectConfiguration/v2.js";
import { UserError } from "../errors.js";

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
    languages: Language[],
    classes: SdkClassConfiguration[],
    backendPath: string,
    packageName?: string,
    packageVersion?: string,
): Promise<SdkHandlerResponse> {
    const inputs: AstGeneratorInput[] = generateAstInputs(classes || [], backendPath);

    const sdkGeneratorInputs: SdkGeneratorInput[] = languages.map((language) => ({
        packageName,
        packageVersion,
        classesInfo: [],
        language,
    }));

    const classesInfo: SdkGeneratorClassesInfoInput[] = [];

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

        for (const sdkGeneratorInput of sdkGeneratorInputs) {
            sdkGeneratorInput.classesInfo.push({
                program: astGeneratorOutput.program,
                classConfiguration,
                fileName: path.basename(input.class.path),
            });
        }

        classesInfo.push({
            program: astGeneratorOutput.program,
            classConfiguration,
            fileName: path.basename(input.class.path),
        });
    }

    return {
        classesInfo,
        generatorResponses: await Promise.all(
            sdkGeneratorInputs.map(async (sdkGeneratorInput): Promise<SdkGeneratorResponse> => {
                return {
                    files: (await generateSdk(sdkGeneratorInput, [])).files,
                    sdkGeneratorInput,
                };
            }),
        ),
    };
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
