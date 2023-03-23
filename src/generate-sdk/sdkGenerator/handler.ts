import JsSdkGenerator from "./JsSdkGenerator";
import TsSdkGenerator from "./TsSdkGenerator";
import SwiftSdkGenerator from "./SwiftSdkGenerator";
import PythonSdkGenerator from "./PythonSdkGenerator";
import { SdkGeneratorInput, SdkGeneratorOutput } from "../../models/genezioModels";
import log from "loglevel";
import { exit } from "process";

/**
 * Asynchronously generates an SDK from a given AST array using specified plugins.
 *
 * @param {SdkGeneratorInput} sdkGeneratorInput - The input parameters for generating the SDK.
 * @param {string[]|undefined} plugins - An optional array of plugins to use for generating the SDK.
 * @returns {Promise<SdkGeneratorOutput>} A Promise that resolves with the generated SDK.
 * @throws {Error} If there was an error generating the SDK.
 */
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
