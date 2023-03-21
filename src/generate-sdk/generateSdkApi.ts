import { generateAst } from "./astGenerator/handler";
import { generateSdk } from "./sdkGenerator/handler";
import { getAstSummary } from "./utils/getAstSummary";
import { AstSummary } from "./models/astSummary";
import { YamlProjectConfiguration } from "../models/yamlProjectConfiguration";
import { getFiles } from "./utils/getFiles";
import { exit } from "process";
import log from "loglevel";
import { AstGeneratorOutput, File, SdkGeneratorInput, SdkGeneratorOutput } from "../models/genezioModels";
import path from "path";
import { SdkGeneratorResponse } from "../models/sdkGeneratorResponse";

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
    let astGeneratorOutput: AstGeneratorOutput;
    try { 
      astGeneratorOutput = await generateAst(file, projectConfiguration.plugins?.astGenerator);
    } catch (err: any) {
      log.error(err);
      exit(1);
    }

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