import { generateAst } from "./astGeneratorHandler";
import { generateSdk } from "./sdkGeneratorHandler";
import { TriggerType, YamlProjectConfiguration } from "../models/yamlProjectConfiguration";
import { ClassDefinition, Program, SdkGeneratorInput, SdkGeneratorOutput } from "../models/genezioModels";
import path from "path";
import { SdkGeneratorResponse } from "../models/sdkGeneratorResponse";


/**
 * Asynchronously handles a request to generate an SDK based on the provided YAML project configuration.
 *
 * @param {YamlProjectConfiguration} projectConfiguration - The YAML project configuration to use for generating the SDK.
 * @returns {Promise<SdkGeneratorResponse>} A Promise that resolves with the response to the SDK generation request.
 * @throws {Error} If there was an error generating the SDK.
 */
export async function sdkGeneratorApiHandler(projectConfiguration: YamlProjectConfiguration): Promise<SdkGeneratorResponse> {
  const sdkLanguage = projectConfiguration.sdk.language;
  const languageExtensions: string[] = Array.from(projectConfiguration.classes.map((c) => path.extname(c.path)));
  // TODO: c.name! not sure if it is okay here.
  const classNames: string[] = Array.from(projectConfiguration.classes.map((c) => c.name!));

  if (languageExtensions.length === 0) {
    // TODO: throw error
  }

  if (languageExtensions.length > 1) {
    // TODO: no idea what to do here. Maybe throw an error?
  }

  // iterate over each class file
  // for (const input of inputs) {
  // Generate genezio AST from file
  const result = await generateAst(process.cwd(), languageExtensions[0], classNames, projectConfiguration.plugins?.astGenerator);

  // prepare input for sdkGenerator
  // sdkGeneratorInput.classesInfo.push({
  //   program: astGeneratorOutput.program,
  //   classConfiguration: projectConfiguration.getClassConfiguration(input.class.path),
  //   fileName: path.basename(input.class.path)
  // });
  // }
  const filteredProgram: Program = {
    ...result.program,
    body: result.program.body!.map((node) => {
      if (node.type === "ClassDefinition" && classNames.includes((node as ClassDefinition).name)) {
        return {
          ...node,
          methods: (node as ClassDefinition).methods.filter((m) => projectConfiguration.getMethodType(path.resolve((node as ClassDefinition).path), m.name) === TriggerType.jsonrpc),
        }
      } else {
        return node;
      }
    })
  }

  console.log(JSON.stringify(filteredProgram));

  // Generate SDK
  const sdkOutput: SdkGeneratorOutput = await generateSdk(
    {
      program: filteredProgram,
      sdk: {
        language: sdkLanguage as string,
      }
    },
    projectConfiguration.plugins?.sdkGenerator
  );

  return {
    files: sdkOutput.files,
    sdkGeneratorInput: {} as SdkGeneratorInput,
  };
}