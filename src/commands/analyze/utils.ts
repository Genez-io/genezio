import path from "path";
import { SSRFrameworkComponentType } from "../../models/projectOptions.js";
import { YamlFrontend, YAMLBackend, YamlContainer } from "../../projectConfiguration/yaml/v2.js";
import { YamlConfigurationIOController } from "../../projectConfiguration/yaml/v2.js";
import { SSRFrameworkComponent } from "../deploy/command.js";

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
        normalizeScripts(scripts);
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
        normalizeScripts(scripts);
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

export async function addSSRComponentToConfig(
    configPath: string,
    component: SSRFrameworkComponent,
    componentType: SSRFrameworkComponentType,
) {
    const configIOController = new YamlConfigurationIOController(configPath);
    // We have to read the config here with fillDefaults=false
    // to be able to edit it in the least intrusive way
    const config = await configIOController.read(/* fillDefaults= */ false);

    const relativePath = path.relative(process.cwd(), component.path) || ".";

    // Ensure each script field is an array
    // It's easier to use arrays consistently instead of
    // having to check if it's a string or an array
    const scripts = component.scripts;
    if (scripts) {
        normalizeScripts(scripts);
    }

    config[componentType] = {
        ...config[componentType],
        path: config[componentType]?.path || relativePath,
        packageManager: config[componentType]?.packageManager || component.packageManager,
        scripts: config[componentType]?.scripts || component.scripts,
    };

    await configIOController.write(config);
}

export async function addContainerComponentToConfig(configPath: string, component: YamlContainer) {
    const configIOController = new YamlConfigurationIOController(configPath);
    // We have to read the config here with fillDefaults=false
    // to be able to edit it in the least intrusive way
    const config = await configIOController.read(/* fillDefaults= */ false);

    const relativePath = path.relative(process.cwd(), component.path) || ".";

    config.container = {
        ...config.container,
        path: config.container?.path || relativePath,
    };

    await configIOController.write(config);
}

type Scripts = {
    deploy?: string | string[];
    build?: string | string[];
    start?: string | string[];
    local?: string | string[];
};

function normalizeScriptProperty(scripts: Scripts, property: keyof Scripts): void {
    if (scripts[property] && typeof scripts[property] === "string") {
        scripts[property] = [scripts[property]];
    }
}

function normalizeScripts(scripts: Scripts): void {
    if (scripts) {
        const properties: (keyof Scripts)[] = ["deploy", "build", "start", "local"];
        properties.forEach((property) => {
            normalizeScriptProperty(scripts, property);
        });
    }
}
