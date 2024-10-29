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

    // Ensure each script field is an array
    // It's easier to use arrays consistently instead of
    // having to check if it's a string or an array
    const scripts = component.scripts;
    if (scripts) {
        if (scripts.deploy && typeof scripts.deploy === "string") {
            scripts.deploy = [scripts.deploy];
        }
        if (scripts.build && typeof scripts.build === "string") {
            scripts.build = [scripts.build];
        }
        if (scripts.start && typeof scripts.start === "string") {
            scripts.start = [scripts.start];
        }
    }

    config["frontend"] = {
        path: component.path,
        publish: component.publish,
        scripts: scripts,
    };

    await configIOController.write(config);
}

export async function addBackendComponentToConfig(
    configPath: string,
    config: YamlProjectConfiguration | RawYamlProjectConfiguration,
    component: YAMLBackend,
) {
    const configIOController = new YamlConfigurationIOController(configPath);

    // Ensure each script field is an array
    // It's easier to use arrays consistently instead of
    // having to check if it's a string or an array
    const scripts = component.scripts;
    if (scripts) {
        if (scripts.deploy && typeof scripts.deploy === "string") {
            scripts.deploy = [scripts.deploy];
        }
        if (scripts.local && typeof scripts.local === "string") {
            scripts.local = [scripts.local];
        }
    }

    config["backend"] = {
        path: component.path,
        language: component.language,
        scripts: component.scripts,
        functions: component.functions,
    };

    await configIOController.write(config);
}
