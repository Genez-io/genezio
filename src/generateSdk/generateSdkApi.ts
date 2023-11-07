import { generateAst } from "./astGeneratorHandler.js";
import { generateSdk } from "./sdkGeneratorHandler.js";
import { YamlProjectConfiguration } from "../models/yamlProjectConfiguration.js";
import { getGenerateAstInputs } from "./utils/getFiles.js";
import { SdkGeneratorInput, SdkGeneratorOutput, SdkVersion } from "../models/genezioModels.js";
import path from "path";
import { SdkGeneratorResponse } from "../models/sdkGeneratorResponse.js";
import { AstGeneratorInput } from "../models/genezioModels.js";

/**
 * Asynchronously handles a request to generate an SDK based on the provided YAML project configuration.
 *
 * @param {YamlProjectConfiguration} projectConfiguration - The YAML project configuration to use for generating the SDK.
 * @returns {Promise<SdkGeneratorResponse>} A Promise that resolves with the response to the SDK generation request.
 * @throws {Error} If there was an error generating the SDK.
 */
export async function sdkGeneratorApiHandler(
    projectConfiguration: YamlProjectConfiguration,
): Promise<SdkGeneratorResponse> {
    let sdkLanguage: string | undefined = projectConfiguration.language;
    if (projectConfiguration.sdk?.language) {
        sdkLanguage = projectConfiguration.sdk?.language;
    }
    const inputs: AstGeneratorInput[] = getGenerateAstInputs(projectConfiguration);

    const sdkGeneratorInput: SdkGeneratorInput = {
        classesInfo: [],
    };

    if (sdkLanguage) {
        sdkGeneratorInput.sdk = {
            language: sdkLanguage as string,
        };
    } else {
        sdkGeneratorInput.sdk = {
            language: "ts",
        };
    }

    // iterate over each class file
    for (const input of inputs) {
        // Generate genezio AST from file
        const astGeneratorOutput = await generateAst(
            input,
            projectConfiguration.plugins?.astGenerator,
        );

        // prepare input for sdkGenerator
        sdkGeneratorInput.classesInfo.push({
            program: astGeneratorOutput.program,
            classConfiguration: projectConfiguration.getClassConfiguration(input.class.path),
            fileName: path.basename(input.class.path),
        });
    }

    const sdkOutput: SdkGeneratorOutput = await generateSdk(
        sdkGeneratorInput,
        projectConfiguration.plugins?.sdkGenerator,
        projectConfiguration.sdk ? SdkVersion.OLD_SDK : SdkVersion.NEW_SDK,
    );

    return {
        files: sdkOutput.files,
        sdkGeneratorInput: sdkGeneratorInput,
    };
}
