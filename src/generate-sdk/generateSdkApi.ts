import { generateAst } from "./astGenerator/handler";
import { generateSdk } from "./sdkGenerator/handler";
import { getAstSummary } from "./utils/getAstSummary";
import { AstSummary } from "./models/astSummary";
import { YamlProjectConfiguration } from "../models/yamlProjectConfiguration";
import { getFiles } from "./utils/getFiles";
import { exit } from "process";
import log from "loglevel";
import File, { GenerateSdkOutput, Program, SdkGeneratorInput } from "../models/genezio-models";
import path from "path";

export async function handler(projectConfiguration: YamlProjectConfiguration) {
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
    let programOutput: Program;
    try { 
      programOutput = await generateAst(file, projectConfiguration.plugins?.astGenerator);
    } catch (err: any) {
      log.error(err);
      exit(1);
    }

    // prepare input for sdkGenerator
    sdkGeneratorInput.classesInfo.push({
      program: programOutput,
      classConfiguration: projectConfiguration.getClassConfiguration(file.path),
      fileName: path.basename(file.path)
    });
  }

  // Generate SDK
  const sdkOutput: GenerateSdkOutput = await generateSdk(
    sdkGeneratorInput, projectConfiguration.plugins?.sdkGenerator
  );

  const astSummary: AstSummary = {
    version: "1.0.0",
    classes: getAstSummary(projectConfiguration)
  };

  return {
    status: "ok",
    classFiles: sdkOutput.classFiles,
    remoteFile: sdkOutput.remoteFile,
    astSummary: astSummary
  };
}