import path from "path";
import { SSRFrameworkComponentType } from "../../models/projectOptions.js";
import {
    YamlFrontend,
    YAMLBackend,
    YamlContainer,
    YAMLService,
} from "../../projectConfiguration/yaml/v2.js";
import { YamlConfigurationIOController } from "../../projectConfiguration/yaml/v2.js";
import { SSRFrameworkComponent } from "../deploy/command.js";
import { FRONTEND_ENV_PREFIX } from "./command.js";
import { Language } from "../../projectConfiguration/yaml/models.js";

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
        environment: {
            ...component.environment,
            ...backend?.environment,
        },
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
        environment: {
            ...component.environment,
            ...config[componentType]?.environment,
        },
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

export async function addServicesToConfig(configPath: string, services: YAMLService) {
    const configIOController = new YamlConfigurationIOController(configPath);
    // We have to read the config here with fillDefaults=false
    // to be able to edit it in the least intrusive way
    const config = await configIOController.read(/* fillDefaults= */ false);

    config.services = config.services || {};

    // Ensure unique types are added
    const existingDatabases = config.services.databases || [];
    const newDatabases = services.databases || [];

    // Add only new database types
    const mergedDatabases = [
        ...existingDatabases,
        ...newDatabases.filter(
            (db) => !existingDatabases.some((existingDb) => existingDb.type === db.type),
        ),
    ];

    // Update services with the merged databases
    config.services.databases = mergedDatabases;

    await configIOController.write(config);

    return config;
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
    const functions: string[] = [];
    const ssrFrameworks: string[] = [];
    const backend = config.backend as YAMLBackend;
    const frontend = config.frontend as YamlFrontend;
    if (!frontend) return;

    if (backend?.functions) functions.push(...Object.keys(backend.functions));
    if (config.nextjs) ssrFrameworks.push("nextjs");
    if (config.nestjs) ssrFrameworks.push("nestjs");
    if (config.nuxt) ssrFrameworks.push("nuxt");
    if (config.nitro) ssrFrameworks.push("nitro");

    // Generate frontend environment variables based on backend functions
    const frontendEnvironment = createFrontendEnvironment(frontendPrefix, functions, ssrFrameworks);
    frontend.environment = frontendEnvironment;

    // Save the updated configuration
    await configIOController.write(config);
}

/**
 * Injects the SDK into the backend configuration.
 * @param configPath The path to the config file.
 */
export async function injectSDKInConfig(configPath: string) {
    const configIOController = new YamlConfigurationIOController(configPath);

    // Load config with minimal changes
    const config = await configIOController.read(/* fillDefaults= */ false);
    const frontend = config.frontend as YamlFrontend;

    // TODO - Add support for other languages
    frontend.sdk = {
        language: Language.ts,
    };

    const scripts = frontend.scripts;
    if (scripts) {
        normalizeScripts(scripts);
    }

    // Check if scripts has the deploy and build properties for typesafe projects
    // If not append them to the scripts object
    frontend.scripts = {
        ...scripts,
        deploy: [
            ...(frontend.scripts?.deploy?.includes(
                "npm install @genezio-sdk/${{projectName}}@1.0.0-${{stage}}",
            )
                ? []
                : ["npm install @genezio-sdk/${{projectName}}@1.0.0-${{stage}}"]),
            ...(frontend.scripts?.deploy?.includes("npm install") ? [] : ["npm install"]),
            ...(frontend.scripts?.deploy || []),
        ],
        build: frontend.scripts?.build || ["npm run build"],
    };

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
    backendFunctions: string[] = [],
    ssrFrameworks: string[] = [],
): Record<string, string> {
    const environment_backend = backendFunctions.reduce<Record<string, string>>(
        (environment, functionName) => {
            const key = formatFunctionNameAsEnvVar(frontendPrefix, functionName);
            const value = `\${{ backend.functions.${functionName}.url }}`;
            environment[key] = value;
            return environment;
        },
        {},
    );

    const environment_ssr = ssrFrameworks.reduce<Record<string, string>>(
        (environment, framework) => {
            const key = `${frontendPrefix}_API_URL_${framework.toUpperCase()}`;
            const value = `\${{ ${framework}.url }}`;
            environment[key] = value;
            return environment;
        },
        {},
    );

    return { ...environment_backend, ...environment_ssr };
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
 * @param contentEntryfile Content of the entry file
 * @returns The handler variable name or undefined if not found
 */
export function getPythonHandler(contentEntryfile: string): string {
    // Check if the contentEntryfile contains Flask or FastAPI initialization
    const flaskPattern = /(\w+)\s*=\s*Flask\(__name__\)/;
    const fastAPIPattern = /(\w+)\s*=\s*FastAPI\(\)/;

    // Match the patterns in the contentEntryfile
    const flaskMatch = contentEntryfile.match(flaskPattern);
    const fastAPIMatch = contentEntryfile.match(fastAPIPattern);

    if (flaskMatch && flaskMatch[1]) {
        return flaskMatch[1];
    }

    if (fastAPIMatch && fastAPIMatch[1]) {
        return fastAPIMatch[1];
    }

    return "app";
}
