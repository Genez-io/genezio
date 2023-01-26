import path from "path"
import { YamlProjectConfiguration } from "../models/yamlProjectConfiguration"
import { checkYamlFileExists, readUTF8File } from "./file"
import { parse } from "yaml"

export async function getProjectConfiguration(configurationFilePath = "./genezio.yaml"): Promise<YamlProjectConfiguration> {
    if (!await checkYamlFileExists()) {
        throw new Error("The configuration file does not exist.");
      }

    const genezioYamlPath = path.join(configurationFilePath);
    const configurationFileContentUTF8 = await readUTF8File(genezioYamlPath);
    const configurationFileContent = await parse(configurationFileContentUTF8);
    const projectConfiguration = await YamlProjectConfiguration.create(configurationFileContent)

    return projectConfiguration
}