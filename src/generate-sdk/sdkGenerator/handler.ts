import JsSdkGenerator from "./JsSdkGenerator";
import TsSdkGenerator from "./TsSdkGenerator";
import SwiftSdkGenerator from "./SwiftSdkGenerator";
import PythonSdkGenerator from "./PythonSdkGenerator";
import { SdkGeneratorInput, SdkGeneratorOutput } from "../../models/genezioModels";
import log from "loglevel";
import { exit } from "process";

export async function generateSdk(
  sdkGeneratorInput: SdkGeneratorInput,
  plugins: string[] | undefined,
): Promise<SdkGeneratorOutput> {
  let pluginsImported: any = [];

  if (plugins) {
    pluginsImported = plugins?.map(async plugin => {
      return await import(plugin).catch((err: any) => {
        log.error(`Plugin(${plugin}) not found. Install it with npm install ${plugin}`);
        exit(1);
      });
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
