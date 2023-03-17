import path from "path";
import { File, Program } from "../../models/genezio-models";
import JsAstGenerator from "./JsAstGenerator";
import TsAstGenerator from "./TsAstGenerator";

export async function generateAst(
  file: File,
  plugins: string[] | undefined,
): Promise<Program> {
  const extension = path.extname(file.path).replace(".", "");
  let pluginsImported: any = [];
  

  if (plugins) {
    pluginsImported = plugins?.map(plugin => {
      return require(plugin);
    });
  }

  pluginsImported.push(JsAstGenerator);
  pluginsImported.push(TsAstGenerator);

  const astGeneratorElem = pluginsImported.find((plugin: any) => {
    return plugin.supportedExtensions.includes(extension);
  });

  if (!astGeneratorElem) {
    throw new Error(`Class language(${extension}) not supported`);
  }

  const astGeneratorClass = new astGeneratorElem.AstGenerator();

  return await astGeneratorClass.generateAst({
    file: file,
  });
}
