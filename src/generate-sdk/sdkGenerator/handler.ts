import { browserSdkJs } from "../templates/browserSdkJs";
import { nodeSdkJs } from "../templates/nodeSdkJs";
import { swiftSdk } from "../templates/swiftSdk";
import { JsSdkGenerator } from "./JsSdkGenerator";
import { TsSdkGenerator } from "./TsSdkGenerator";
import { SwiftSdkGenerator } from "./SwiftSdkGenerator";
import { nodeSdkTs } from "../templates/nodeSdkTs";
import { browserSdkTs } from "../templates/browserSdkTs";
import { PythonSdkGenerator } from "./PythonSdkGenerator";
import { pythonSdk } from "../templates/pythonSdk";
import { SdkGeneratorInput, SdkGeneratorOutput } from "../../models/genezio-models";

export async function generateSdk(
  sdkGeneratorInput: SdkGeneratorInput,
  plugins: string[] | undefined,
): Promise<SdkGeneratorOutput> {
  let pluginsImported: any = [];

  const generateSdkOutput: SdkGeneratorOutput = {
    files: undefined,
  };

  if (plugins) {
    pluginsImported = plugins?.map(plugin => {
      return require(plugin);
    });
  }

  pluginsImported.push(JsSdkGenerator);
  pluginsImported.push(TsSdkGenerator);
  pluginsImported.push(SwiftSdkGenerator);
  pluginsImported.push(PythonSdkGenerator);

  const sdkGeneratorElem = pluginsImported.find((plugin: any) => {
    return plugin.supportedLanguages.includes(sdkGeneratorInput.sdk.language);
  });

  if (!sdkGeneratorElem) {
    throw new Error(`SDK language(${sdkGeneratorInput.sdk.language}) not supported`);
  }

  const sdkGeneratorClass = new sdkGeneratorElem.SdkGenerator();

  return await sdkGeneratorClass.generateSdk(sdkGeneratorInput);
}





  switch (generateSdkHandlerInput.sdkLanguage) {
    case SdkLanguage.ts:
      sdkGenerator = new TsSdkGenerator();

      generateSdkOutput.remoteFile =
        generateSdkHandlerInput.sdkOptions.runtime === "node"
          ? nodeSdkTs.replace("%%%url%%%", "undefined")
          : browserSdkTs.replace("%%%url%%%", "undefined");
      break;
    case SdkLanguage.swift:
      sdkGenerator = new SwiftSdkGenerator();
      generateSdkOutput.remoteFile = swiftSdk;
      break;
    case SdkLanguage.python:
      sdkGenerator = new PythonSdkGenerator();
      generateSdkOutput.remoteFile = pythonSdk;
      break;
    default:
      sdkGenerator = undefined;
      break;
  }

  if (!sdkGenerator) {
    throw new Error(
      `Sdk language(${generateSdkHandlerInput.sdkLanguage}) not supported`
    );
  }

  for (let sdkGeneratorInfo of generateSdkHandlerInput.sdkGeneratorInfos) {
    const classFile: SdkClassFile | undefined =
      await sdkGenerator.generateClassSdk(sdkGeneratorInfo);

    if (classFile !== undefined) {
      generateSdkOutput.classFiles.push(classFile);
    }
  }

  return generateSdkOutput;
}
