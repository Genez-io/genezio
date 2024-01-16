import JsSdkGenerator from "./sdkGenerator/JsSdkGenerator.js";
import TsSdkGenerator from "./sdkGenerator/TsSdkGenerator.js";
import SwiftSdkGenerator from "./sdkGenerator/SwiftSdkGenerator.js";
import PythonSdkGenerator from "./sdkGenerator/PythonSdkGenerator.js";
import DartSdkGenerator from "./sdkGenerator/DartSdkGenerator.js";
import KotlinSdkGenerator from "./sdkGenerator/KotlinSdkGenerator.js";
import {
    SdkGeneratorInput,
    SdkGeneratorInterface,
    SdkGeneratorOutput,
} from "../models/genezioModels.js";
import log from "loglevel";
import { exit } from "process";
import { debugLogger } from "../utils/logging.js";
import zod from "zod";

interface SdkGeneratorPlugin {
    SdkGenerator: new () => SdkGeneratorInterface;
    supportedLanguages: string[];
}

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
    let pluginsImported: SdkGeneratorPlugin[] = [];

    if (plugins) {
        pluginsImported = await Promise.all(
            plugins?.map(async (plugin) => {
                const dynamicPlugin = await import(plugin).catch((err) => {
                    log.error(`Plugin(${plugin}) not found. Install it with npm install ${plugin}`);
                    debugLogger.debug(err);
                    exit(1);
                });

                if (!dynamicPlugin) {
                    log.error(`Plugin(${plugin}) could not be imported.`);
                    exit(1);
                }

                // Check type of plugin at runtime
                const pluginSchema = zod.object({
                    SdkGenerator: zod.function(),
                    supportedExtensions: zod.array(zod.string()),
                });
                if (pluginSchema.safeParse(dynamicPlugin).success === false) {
                    log.error(
                        `Plugin(${plugin}) is not a valid SDK generator plugin. It must export a SdkGenerator class and supportedLanguages array.`,
                    );
                    exit(1);
                }

                return dynamicPlugin as SdkGeneratorPlugin;
            }),
        );
    }

    pluginsImported.push(JsSdkGenerator);
    pluginsImported.push(TsSdkGenerator);
    pluginsImported.push(SwiftSdkGenerator);
    pluginsImported.push(PythonSdkGenerator);
    pluginsImported.push(DartSdkGenerator);
    pluginsImported.push(KotlinSdkGenerator);

    const sdk = sdkGeneratorInput.sdk;
    if (!sdk) {
        throw new Error(`SDK language not specified`);
    }

    const sdkGeneratorElem = pluginsImported.find((plugin) => {
        return plugin.supportedLanguages.includes(sdk.language ?? "");
    });

    if (!sdkGeneratorElem) {
        throw new Error(`SDK language(${sdk.language}) not supported`);
    }

    const sdkGeneratorClass = new sdkGeneratorElem.SdkGenerator();

    return await sdkGeneratorClass.generateSdk(sdkGeneratorInput);
}
