import { generateAst } from "./astGeneratorHandler";
import { generateSdk } from "./sdkGeneratorHandler";
import { getAstSummary } from "./utils/getAstSummary";
import { YamlProjectConfiguration } from "../models/yamlProjectConfiguration";
import { getFiles } from "./utils/getFiles";
import { exit } from "process";
import log from "loglevel";
import { AstGeneratorOutput, File, SdkGeneratorInput, SdkGeneratorOutput } from "../models/genezioModels";
import path from "path";
import { SdkGeneratorResponse } from "../models/sdkGeneratorResponse";
import { AstSummary } from "../models/astSummary";


/**
 * Asynchronously handles a request to generate an SDK based on the provided YAML project configuration.
 *
 * @param {YamlProjectConfiguration} projectConfiguration - The YAML project configuration to use for generating the SDK.
 * @returns {Promise<SdkGeneratorResponse>} A Promise that resolves with the response to the SDK generation request.
 * @throws {Error} If there was an error generating the SDK.
 */
export async function sdkGeneratorApiHandler(projectConfiguration: YamlProjectConfiguration): Promise<SdkGeneratorResponse> {
  const sdkLanguage = projectConfiguration.sdk.language;
  const files: File[] = getFiles(projectConfiguration);

  const sdkGeneratorInput: SdkGeneratorInput = {
    classesInfo: [],
    sdk: {
      language: sdkLanguage as string,
      options: projectConfiguration.sdk.options
    }
  };

  // iterate over each class file
  for (const file of files) {
    // Generate genezio AST from file
    const astGeneratorOutput = await generateAst(file, projectConfiguration.plugins?.astGenerator);

    // prepare input for sdkGenerator
    sdkGeneratorInput.classesInfo.push({
      program: astGeneratorOutput.program,
      classConfiguration: projectConfiguration.getClassConfiguration(file.path),
      fileName: path.basename(file.path)
    });
  }

  // Generate SDK
  const sdkOutput: SdkGeneratorOutput = await generateSdk(
    sdkGeneratorInput, projectConfiguration.plugins?.sdkGenerator
  );

  // Generate AST Summary
  const astSummary: AstSummary = {
    version: "1.0.0",
    classes: getAstSummary(sdkGeneratorInput.classesInfo)
  };
  

  return {
    files: sdkOutput.files,
    astSummary: astSummary
  };
}