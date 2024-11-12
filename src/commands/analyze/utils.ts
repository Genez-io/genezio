import path from "path";
import { SSRFrameworkComponentType } from "../../models/projectOptions.js";
import { YamlFrontend, YAMLBackend, YamlContainer } from "../../projectConfiguration/yaml/v2.js";
import { YamlConfigurationIOController } from "../../projectConfiguration/yaml/v2.js";
import { SSRFrameworkComponent } from "../deploy/command.js";
import { FRONTEND_ENV_PREFIX } from "./command.js";

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

/**
 * Injects the backend function URLs into the frontend environment variables.
 * @param frontendPrefix The prefix to use for the frontend environment variables.
 * @param configPath The path to the config file.
 */
export async function injectBackendApiUrlsInConfig(configPath: string, frontendPrefix: string) {
    const configIOController = new YamlConfigurationIOController(configPath);

    // Load config with minimal changes
    const config = await configIOController.read(/* fillDefaults= */ false);

    // Validate backend and frontend existence
    const backend = config.backend as YAMLBackend;
    const frontend = config.frontend as YamlFrontend;
    if (!backend || !frontend) return;

    const backendFunctions = backend.functions;
    if (!backendFunctions) return;

    // Generate frontend environment variables based on backend functions
    const frontendEnvironment = createFrontendEnvironment(frontendPrefix, backendFunctions);
    frontend.environment = frontendEnvironment;

    // Save the updated configuration
    await configIOController.write(config);
}

/**
 * Returns the frontend environment variable prefix based on the frontend framework.
 *
 * @param framework
 * @returns
 */
export function getFrontendPrefix(framework: string): string {
    switch (framework.toLowerCase()) {
        case "react":
            return FRONTEND_ENV_PREFIX.React;
        case "vue":
            return FRONTEND_ENV_PREFIX.Vue;
        case "vite":
            return FRONTEND_ENV_PREFIX.Vite;
        default:
            return FRONTEND_ENV_PREFIX.Vite;
    }
}

/**
 * Creates a Record<string, string> where each key represents a frontend environment
 * variable based on the backend function name and each value is the function's URL.
 */
function createFrontendEnvironment(
    frontendPrefix: string,
    backendFunctions: Array<{ name: string }>,
): Record<string, string> {
    return backendFunctions.reduce<Record<string, string>>((environment, func) => {
        const key = formatFunctionNameAsEnvVar(frontendPrefix, func.name);
        const value = `\${{ backend.functions.${func.name}.url }}`;
        environment[key] = value;
        return environment;
    }, {});
}

/**
 * Formats a backend function name into an uppercase environment variable key.
 */
function formatFunctionNameAsEnvVar(prefix: string, functionName: string): string {
    return `${prefix}_API_URL_${functionName.toUpperCase().replace(/-/g, "_")}`;
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

/**
 * Returns the handler for a given python framework.
 * Searches for framework initialization patterns in Python code.
 * @param contents Record of file contents to search through
 * @param framework The framework name (Flask, FastAPI, Django etc.)
 * @returns The handler variable name or undefined if not found
 */
export async function getPythonHandler(
    contents: Record<string, string>,
    framework: string,
): Promise<string> {
    const frameworkName = framework.toLowerCase();

    // Common initialization patterns for different frameworks
    const patterns = [
        // Flask/FastAPI style
        new RegExp(`(\\w+)\\s*=\\s*${frameworkName}\\s*\\(`, "i"),
        // Django style
        new RegExp(`(\\w+)\\s*=\\s*get_[wa]sgi_application\\(\\)`, "i"),
    ];

    // Iterate through all values in the contents record
    for (const content of Object.values(contents)) {
        const lines = content.split("\n");

        for (const line of lines) {
            for (const pattern of patterns) {
                const match = line.match(pattern);
                if (match && match[1]) {
                    return match[1];
                }
            }
        }
    }

    return "default";
}
