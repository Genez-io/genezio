import { YamlFrontend, YAMLBackend } from "../../projectConfiguration/yaml/v2.js";
import { YamlConfigurationIOController } from "../../projectConfiguration/yaml/v2.js";

export async function addFrontendComponentToConfig(configPath: string, component: YamlFrontend) {
    const configIOController = new YamlConfigurationIOController(configPath);
    // We have to read the config here with fillDefaults=false
    // to be able to edit it in the least intrusive way
    const config = await configIOController.read(/* fillDefaults= */ false);

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

    // Update the existing frontend component only with the fields that are not set
    // If the user set a specific field in the `genezio.yaml` we are going to assume is intentional
    let frontend = config.frontend as YamlFrontend;

    frontend = {
        ...config.frontend,
        path: frontend?.path || component.path,
        publish: frontend?.publish || component.publish,
        scripts: {
            deploy: frontend?.scripts?.deploy || scripts?.deploy,
            build: frontend?.scripts?.build || scripts?.build,
            start: frontend?.scripts?.start || scripts?.start,
        },
    };

    config.frontend = frontend;

    await configIOController.write(config);
}

export async function addBackendComponentToConfig(configPath: string, component: YAMLBackend) {
    const configIOController = new YamlConfigurationIOController(configPath);
    // We have to read the config here with fillDefaults=false
    // to be able to edit it in the least intrusive way
    const config = await configIOController.read(/* fillDefaults= */ false);

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

    // Update the existing frontend component only with the fields that are not set
    // If the user set a specific field in the `genezio.yaml` we are going to assume is intentional
    let backend = config.backend as YAMLBackend;

    backend = {
        ...config.backend,
        path: backend?.path || component.path,
        language: backend?.language || component.language,
        functions: backend?.functions || component.functions,
        scripts: {
            deploy: backend?.scripts?.deploy || scripts?.deploy,
            local: backend?.scripts?.local || scripts?.local,
        },
    };

    config.backend = backend;

    await configIOController.write(config);
}
