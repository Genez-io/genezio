import log from "loglevel";
import path from "path";
import { AstGeneratorOutput, File } from "../models/genezioModels";
import { AstGeneratorInput } from "../models/genezioModels";
import JsAstGenerator from "./astGenerator/JsAstGenerator";
import TsAstGenerator from "./astGenerator/TsAstGenerator";
import { exit } from "process";
import DartAstGenerator from "./astGenerator/DartAstGenerator";
import { debugLogger } from "../utils/logging";


/**
 * Asynchronously generates an abstract syntax tree (AST) from a file using specified plugins.
 *
 * @param {File} file - The file to generate an AST from.
 * @param {string[]|undefined} plugins - An optional array of plugins to use for generating the AST.
 * @returns {Promise<AstGeneratorOutput>} A Promise that resolves with the generated AST.
 * @throws {Error} If there was an error generating the AST.
 */
export async function generateAst(
  input: AstGeneratorInput,
  plugins: string[] | undefined,
): Promise<AstGeneratorOutput> {
  const extension = path.extname(input.class.path).replace(".", "");
  let pluginsImported: any = [];
  

  if (plugins) {
    pluginsImported = plugins?.map(async plugin => {
      return await import(plugin).catch((err: any) => {
        log.error(`Plugin(${plugin}) not found. Install it with npm install ${plugin}`);
        exit(1);
      });
    });
  }

  pluginsImported.push(JsAstGenerator);
  pluginsImported.push(TsAstGenerator);
  pluginsImported.push(DartAstGenerator);

  const plugin = pluginsImported.find((plugin: any) => {
    return plugin.supportedExtensions.includes(extension);
  });

  if (!plugin) {
    throw new Error(`Class language(${extension}) not supported`);
  }

  const astGeneratorClass = new plugin.AstGenerator();

  return await astGeneratorClass.generateAst(input)
    .catch((err: any) => {
      debugLogger.log("An error has occured", err);
      throw Object.assign(err, { path: input.class.path});
    });
}
