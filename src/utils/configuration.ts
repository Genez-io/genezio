import path from "path";
import {
  BackendConfigurationRequired,
  YamlProjectConfiguration,
} from "../models/yamlProjectConfiguration.js";
import { checkYamlFileExists, readUTF8File } from "./file.js";
import { parse } from "yaml";

export async function getProjectConfiguration(
  configurationFilePath = "./genezio.yaml",
  backendConfigurationRequired: BackendConfigurationRequired
): Promise<YamlProjectConfiguration> {
  if (!(await checkYamlFileExists(configurationFilePath))) {
    throw new Error("The configuration file does not exist.");
  }

  const genezioYamlPath = path.join(configurationFilePath);
  const configurationFileContentUTF8 = await readUTF8File(genezioYamlPath);
  let configurationFileContent = null;

  try {
    configurationFileContent = await parse(configurationFileContentUTF8);
  } catch (error) {
    throw new Error(`The configuration yaml file is not valid.\n${error}`);
  }
  const projectConfiguration = await YamlProjectConfiguration.create(
    configurationFileContent,
    backendConfigurationRequired
  );

  return projectConfiguration;
}
