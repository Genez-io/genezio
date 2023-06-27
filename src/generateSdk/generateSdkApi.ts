import { generateAst } from "./astGeneratorHandler.js";
import { generateSdk } from "./sdkGeneratorHandler.js";
import { YamlProjectConfiguration } from "../models/yamlProjectConfiguration.js";
import { getGenerateAstInputs } from "./utils/getFiles.js";
import { SdkGeneratorInput, SdkGeneratorOutput } from "../models/genezioModels.js";
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
export async function sdkGeneratorApiHandler(projectConfiguration: YamlProjectConfiguration): Promise<SdkGeneratorResponse> {
  const sdkLanguage = projectConfiguration.sdk.language;
  const inputs: AstGeneratorInput[] = getGenerateAstInputs(projectConfiguration);

  const sdkGeneratorInput: SdkGeneratorInput = {
    classesInfo: [],
    sdk: {
      language: sdkLanguage as string,
    }
  };

  // iterate over each class file
  for (const input of inputs) {
    // Generate genezio AST from file
    const astGeneratorOutput = await generateAst(input, projectConfiguration.plugins?.astGenerator);

    // prepare input for sdkGenerator
    sdkGeneratorInput.classesInfo.push({
      program: astGeneratorOutput.program,
      classConfiguration: projectConfiguration.getClassConfiguration(input.class.path),
      fileName: path.basename(input.class.path)
    });
  }

  // Generate SDK
  const sdkOutput: SdkGeneratorOutput = await generateSdk(
    sdkGeneratorInput, projectConfiguration.plugins?.sdkGenerator
  );

  return {
    files: sdkOutput.files,
    sdkGeneratorInput: sdkGeneratorInput,
  };
}