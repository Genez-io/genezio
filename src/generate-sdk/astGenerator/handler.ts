import path from "path";
import { AstGeneratorOutput, File, Program } from "../../models/genezioModels";
import JsAstGenerator from "./JsAstGenerator";
import TsAstGenerator from "./TsAstGenerator";

export async function generateAst(
  file: File,
  plugins: string[] | undefined,
): Promise<AstGeneratorOutput> {
  const extension = path.extname(file.path).replace(".", "");
  let pluginsImported: any = [];
  

  if (plugins) {
    pluginsImported = plugins?.map(plugin => {
      return require(plugin);
    });
  }

  pluginsImported.push(JsAstGenerator);
  pluginsImported.push(TsAstGenerator);

  const plugin = pluginsImported.find((plugin: any) => {
    return plugin.supportedExtensions.includes(extension);
  });

  if (!plugin) {
    throw new Error(`Class language(${extension}) not supported`);
  }

  const astGeneratorClass = new plugin.AstGenerator();

  return await astGeneratorClass.generateAst({
    file: file,
  })
}
