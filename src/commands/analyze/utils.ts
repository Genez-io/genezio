import path from "path";
import fs from "fs/promises";
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

    config.services = {
        ...config.services,
        ...services,
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

export async function getExpressPort(componentPath: string, entryFile: string): Promise<number> {
    try {
        const content = await fs.readFile(path.join(componentPath, entryFile), "utf-8");

        // Match ".listen(...)" syntax
        const listenMatch = content.match(
            /\.listen\(\s*(\w+|process\.env\.\w+\s*\|\|\s*\d+|\d+)[\s,)]/,
        );
        if (!listenMatch) return 8080;

        const portExpression = listenMatch[1];

        // Handle direct process.env.PORT || number syntax in listen
        const directEnvMatch = portExpression.match(/process\.env\.(\w+)\s*\|\|\s*(\d+)/);
        if (directEnvMatch) {
            const envVar = directEnvMatch[1];
            const fallbackPort = parseInt(directEnvMatch[2], 10);

            try {
                const envContent = await fs.readFile(path.join(componentPath, ".env"), "utf-8");
                const envLines = envContent.split("\n").map((line) => line.trim());
                const envValue = envLines
                    .find((line) => line.startsWith(`${envVar}=`) && !line.startsWith("#"))
                    ?.split("=")
                    .map((part) => part.trim())[1]
                    ?.replace(/^["'](.*)["']$/, "$1");
                if (envValue) {
                    const port = parseInt(envValue, 10);
                    if (!isNaN(port)) {
                        return port;
                    }
                }
            } catch (err) {
                // If .env reading fails, fall back silently
            }
            return fallbackPort;
        }

        // Handle "app.listen(port || 3000)" or similar syntax
        const orMatch = portExpression.match(/(\w+)\s*\|\|\s*(\d+)/);
        if (orMatch) {
            const variable = orMatch[1];
            const fallbackPort = parseInt(orMatch[2], 10);

            // Check if the variable is defined as "const port = ..."
            const variableMatch = content.match(new RegExp(`const\\s+${variable}\\s*=\\s*(.*);`));
            if (variableMatch) {
                const variableValue = variableMatch[1];

                // Handle "const port = process.env.PORT || 3000"
                const envOrMatch = variableValue.match(/process\.env\.(\w+)\s*\|\|\s*(\d+)/);
                if (envOrMatch) {
                    const envVar = envOrMatch[1];
                    const envFallbackPort = parseInt(envOrMatch[2], 10);

                    try {
                        const envContent = await fs.readFile(
                            path.join(componentPath, ".env"),
                            "utf-8",
                        );
                        // More robust .env parsing
                        const envLines = envContent.split("\n").map((line) => line.trim());
                        const envValue = envLines
                            .find((line) => line.startsWith(`${envVar}`) && !line.startsWith("#"))
                            ?.split("=")
                            .map((part) => part.trim())[1] // Trim both parts around equals
                            ?.replace(/^["'](.*)["']$/, "$1"); // Remove quotes if present
                        if (envValue) {
                            const port = parseInt(envValue, 10);
                            if (!isNaN(port)) {
                                return port;
                            }
                        }
                    } catch (err) {
                        // If .env reading fails, fall back silently
                    }
                    return envFallbackPort;
                }

                // Handle numeric assignment directly: "const port = 3000"
                const numericMatch = variableValue.match(/^\d+$/);
                if (numericMatch) {
                    return parseInt(variableValue, 10);
                }
            }

            // If no variable definition found, use fallback port
            return fallbackPort;
        }

        // Handle "app.listen(port)" where port is a variable
        const variableMatch = content.match(new RegExp(`const\\s+${portExpression}\\s*=\\s*(.*);`));
        if (variableMatch) {
            const variableValue = variableMatch[1];

            // Handle "const port = process.env.PORT || 3000"
            const envOrMatch = variableValue.match(/process\.env\.(\w+)\s*\|\|\s*(\d+)/);
            if (envOrMatch) {
                const envVar = envOrMatch[1];
                const envFallbackPort = parseInt(envOrMatch[2], 10);

                try {
                    const envContent = await fs.readFile(path.join(componentPath, ".env"), "utf-8");
                    // More robust .env parsing
                    const envLines = envContent.split("\n").map((line) => line.trim());
                    const envValue = envLines
                        .find((line) => line.startsWith(`${envVar}`) && !line.startsWith("#"))
                        ?.split("=")
                        .map((part) => part.trim())[1] // Trim both parts around equals
                        ?.replace(/^["'](.*)["']$/, "$1"); // Remove quotes if present
                    if (envValue) {
                        const port = parseInt(envValue, 10);
                        if (!isNaN(port)) {
                            return port;
                        }
                    }
                } catch (err) {
                    // If .env reading fails, fall back silently
                }
                return envFallbackPort;
            }

            // Handle numeric assignment directly: "const port = 3000"
            const numericMatch = variableValue.match(/^\d+$/);
            if (numericMatch) {
                return parseInt(variableValue, 10);
            }
        }

        // Handle numeric port directly
        const numericPort = parseInt(portExpression, 10);
        if (!isNaN(numericPort)) return numericPort;

        return 8080;
    } catch {
        return 8080;
    }
}
