import { YamlProjectConfiguration } from "../../models/yamlProjectConfiguration";
import fs from 'fs';
import File from "../../models/genezio-models";

export function getFiles(projectConfiguration: YamlProjectConfiguration) {
  const files: File[] = [];

  for (const classFile of projectConfiguration.classes) {
    // read file from classFile.path
    const data = fs.readFileSync("./mytext.txt", "utf-8");

    files.push(new File(classFile.path, data));
  }

  return files;
}