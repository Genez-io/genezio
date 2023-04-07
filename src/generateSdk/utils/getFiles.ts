import { YamlProjectConfiguration } from "../../models/yamlProjectConfiguration";
import fs from 'fs';
import { File } from "../../models/genezioModels";
import { AstGeneratorInput } from "../../models/genezioAst";

export function getGenerateAstInputs(projectConfiguration: YamlProjectConfiguration): AstGeneratorInput[] {
  const getGenerateAstInputs: AstGeneratorInput[] = [];

  for (const classFile of projectConfiguration.classes) {
    // read file from classFile.path
    const data = fs.readFileSync(classFile.path, "utf-8");

    getGenerateAstInputs.push({
      class: {
        path: classFile.path,
        data,
        name: classFile.name,
      }
    });
  }

  return getGenerateAstInputs;
}