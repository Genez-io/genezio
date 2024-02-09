import log from "loglevel";
import path from "path";
import { AstGeneratorInterface, AstGeneratorOutput } from "../models/genezioModels.js";
import { AstGeneratorInput } from "../models/genezioModels.js";
import JsAstGenerator from "./astGenerator/JsAstGenerator.js";
import TsAstGenerator from "./astGenerator/TsAstGenerator.js";
import KotlinAstGenerator from "./astGenerator/KotlinAstGenerator.js";
import { exit } from "process";
import DartAstGenerator from "./astGenerator/DartAstGenerator.js";
import { debugLogger } from "../utils/logging.js";
import { supportedExtensions } from "../utils/languages.js";
import zod from "zod";
import GoAstGenerator from "./astGenerator/GoAstGenerator.js";

interface AstGeneratorPlugin {
    AstGenerator: new () => AstGeneratorInterface;
    supportedExtensions: string[];
}

/**
 * Asynchronously generates an abstract syntax tree (AST) from a file using specified plugins.
 *
 * @param {string[]|undefined} plugins - An optional array of plugins to use for generating the AST.
 * @returns {Promise<AstGeneratorOutput>} A Promise that resolves with the generated AST.
 * @throws {Error} If there was an error generating the AST.
 */
export async function generateAst(
    input: AstGeneratorInput,
    plugins: string[] | undefined,
    backendPath?: string,
): Promise<AstGeneratorOutput> {
    const extension = path.extname(input.class.path).replace(".", "");
    let pluginsImported: AstGeneratorPlugin[] = [];

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
                    AstGenerator: zod.function(),
                    supportedExtensions: zod.array(zod.string()),
                });
                if (pluginSchema.safeParse(dynamicPlugin).success === false) {
                    log.error(
                        `Plugin(${plugin}) is not a valid AST generator plugin. It must export a AstGenerator class and supportedExtensions array.`,
                    );
                    exit(1);
                }

                return dynamicPlugin as AstGeneratorPlugin;
            }),
        );
    }

    pluginsImported.push(JsAstGenerator);
    pluginsImported.push(TsAstGenerator);
    pluginsImported.push(DartAstGenerator);
    pluginsImported.push(KotlinAstGenerator);
    pluginsImported.push(GoAstGenerator);

    const plugin = pluginsImported.find((plugin) => {
        return plugin.supportedExtensions.includes(extension);
    });

    if (!plugin) {
        const supportedExtensionsString =
            supportedExtensions.slice(0, -1).join(", ") +
            (supportedExtensions.length > 1 ? " and " : "") +
            supportedExtensions.slice(-1);

        throw new Error(
            `Class language(${extension}) not supported. Currently supporting: ${supportedExtensionsString}. You can delete the class from genezio.yaml`,
        );
    }

    const astGeneratorClass = new plugin.AstGenerator();

    return await astGeneratorClass.generateAst(input, backendPath).catch((err) => {
        debugLogger.log("An error has occurred", err);
        throw Object.assign(err, { path: input.class.path });
    });
}
