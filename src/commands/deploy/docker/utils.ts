import { YamlProjectConfiguration, YamlContainer } from "../../../projectConfiguration/yaml/v2.js";
import {
    RawYamlProjectConfiguration,
    YamlConfigurationIOController,
} from "../../../projectConfiguration/yaml/v2.js";

export async function addContainerComponentToConfig(
    configPath: string,
    config: YamlProjectConfiguration | RawYamlProjectConfiguration,
    component: YamlContainer,
) {
    if (!config.container) {
        config["container"] = {
            path: component.path,
        };

        const configIOController = new YamlConfigurationIOController(configPath);
        await configIOController.write(config);
    }
}
