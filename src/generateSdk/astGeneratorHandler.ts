import path from "path";
import { AstGeneratorInterface, AstGeneratorOutput } from "../models/genezioModels.js";
import { AstGeneratorInput } from "../models/genezioModels.js";
import JsAstGenerator from "./astGenerator/JsAstGenerator.js";
import TsAstGenerator from "./astGenerator/TsAstGenerator.js";
import KotlinAstGenerator from "./astGenerator/KotlinAstGenerator.js";
import DartAstGenerator from "./astGenerator/DartAstGenerator.js";
import { debugLogger } from "../utils/logging.js";
import { supportedExtensions } from "../utils/languages.js";
import zod from "zod";
import GoAstGenerator from "./astGenerator/GoAstGenerator.js";
import { UserError } from "../errors.js";

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
): Promise<AstGeneratorOutput> {
    const extension = path.extname(input.class.path).replace(".", "");
    let pluginsImported: AstGeneratorPlugin[] = [];

    if (plugins) {
        pluginsImported = await Promise.all(
            plugins?.map(async (plugin) => {
                const dynamicPlugin = await import(plugin).catch((err) => {
                    debugLogger.debug(err);
                    throw new UserError(
                        `Plugin(${plugin}) not found. Install it with npm install ${plugin}`,
                    );
                });

                if (!dynamicPlugin) {
                    throw new UserError(`Plugin(${plugin}) could not be imported.`);
                }

                // Check type of plugin at runtime
                const pluginSchema = zod.object({
                    AstGenerator: zod.function(),
                    supportedExtensions: zod.array(zod.string()),
                });
                if (pluginSchema.safeParse(dynamicPlugin).success === false) {
                    throw new UserError(
                        `Plugin(${plugin}) is not a valid AST generator plugin. It must export a AstGenerator class and supportedExtensions array.`,
                    );
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

        throw new UserError(
            `Class language(${extension}) not supported. Currently supporting: ${supportedExtensionsString}. You can delete the class from genezio.yaml`,
        );
    }

    const astGeneratorClass = new plugin.AstGenerator();

    return await astGeneratorClass.generateAst(input);
}
