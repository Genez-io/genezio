import {
    YamlProjectConfiguration,
    YamlFrontend,
    YAMLBackend,
} from "../../projectConfiguration/yaml/v2.js";
import {
    RawYamlProjectConfiguration,
    YamlConfigurationIOController,
} from "../../projectConfiguration/yaml/v2.js";

export async function addFrontendComponentToConfig(
    configPath: string,
    config: YamlProjectConfiguration | RawYamlProjectConfiguration,
    component: YamlFrontend,
) {
    const configIOController = new YamlConfigurationIOController(configPath);

    config["frontend"] = {
        path: component.path,
        publish: component.publish,
        scripts: component.scripts,
    };

    await configIOController.write(config);
}

export async function addBackendComponentToConfig(
    configPath: string,
    config: YamlProjectConfiguration | RawYamlProjectConfiguration,
    component: YAMLBackend,
) {
    const configIOController = new YamlConfigurationIOController(configPath);

    config["backend"] = {
        path: component.path,
        language: component.language,
        scripts: component.scripts,
        functions: component.functions,
    };

    await configIOController.write(config);
}
