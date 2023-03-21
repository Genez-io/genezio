import JsSdkGenerator from "./JsSdkGenerator";
import TsSdkGenerator from "./TsSdkGenerator";
import SwiftSdkGenerator from "./SwiftSdkGenerator";
import PythonSdkGenerator from "./PythonSdkGenerator";
import { SdkGeneratorInput, SdkGeneratorOutput } from "../../models/genezio-models";

export async function generateSdk(
  sdkGeneratorInput: SdkGeneratorInput,
  plugins: string[] | undefined,
): Promise<SdkGeneratorOutput> {
  let pluginsImported: any = [];

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
