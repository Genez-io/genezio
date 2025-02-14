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
        entryFile: config[componentType]?.entryFile || component.entryFile,
        runtime: config[componentType]?.runtime || component.runtime,
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

// TODO - Remove this method when support for functions (express, flask etc) with nextjs, nuxt, remix is added
export async function handleBackendAndSSRConfig(configPath: string) {
    const configIOController = new YamlConfigurationIOController(configPath);

    // Load configuration with minimal changes
    const config = await configIOController.read(/* fillDefaults= */ false);

    // Remove SSR-related framework configurations
    const ssrFrameworks = Object.values(SSRFrameworkComponentType);
    for (const framework of ssrFrameworks) {
        config[framework] = undefined;
    }

    // Save the updated configuration
    await configIOController.write(config);
}

/**
 * Injects the backend function URLs like express, flask (backend functions), nestjs and nitro
 * into the frontend environment variables like react, vue, angular, nextjs and nuxt.
 *
 * @param frontendPrefix The prefix to use for the frontend environment variables.
 * @param configPath The path to the config file.
 */
export async function injectBackendUrlsInConfig(configPath: string) {
    const configIOController = new YamlConfigurationIOController(configPath);

    // Load config with minimal changes
    const config = await configIOController.read(/* fillDefaults= */ false);

    const backend = config.backend as YAMLBackend;
    const functions: string[] = backend?.functions?.map((fn) => fn.name) || [];
    const ssrFunctions: string[] = [];

    const ssrFrameworks = [SSRFrameworkComponentType.nestjs, SSRFrameworkComponentType.nitro];

    ssrFrameworks.forEach((framework) => {
        if (config[framework]) {
            ssrFunctions.push(framework);
        }
    });

    // Early return if there is nothing to inject
    if (functions.length === 0 && ssrFunctions.length === 0) {
        return;
    }

    // Generate frontend environment variables based on backend functions
    const frontend = config.frontend as YamlFrontend;
    if (frontend) {
        // TODO Support multiple frontend frameworks in the same project
        const frontendPrefix = getFrontendPrefix(Object.keys(frontend)[0]);
        const frontendEnvironment = {
            ...createFrontendEnvironmentRecord(frontendPrefix, functions, ssrFunctions),
            ...frontend.environment,
        };
        frontend.environment = frontendEnvironment;
        config.frontend = frontend;
    }

    // TODO - Uncomment this when support for functions (express, flask etc) with nextjs, nuxt, remix is added
    // const frameworks = [
    //     { key: SSRFrameworkComponentType.next, prefix: "NEXT_PUBLIC" },
    //     { key: SSRFrameworkComponentType.nuxt, prefix: "NUXT" },
    // ];

    // frameworks.forEach(({ key, prefix }) => {
    //     if (config[key]) {
    //         const environment = {
    //             ...createFrontendEnvironmentRecord(prefix, functions, ssrFunctions),
    //             ...config[key].environment,
    //         };
    //         config[key].environment = environment;
    //     }
    // });

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
export function createFrontendEnvironmentRecord(
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

interface TypeScriptConfig {
    compilerOptions?: CompilerOptions;
    include?: string[];
}

interface CompilerOptions {
    outDir?: string;
    rootDir?: string;
    module?: string;
    moduleResolution?: string;
    target?: string;
}

const DEFAULT_COMPILER_OPTIONS = {
    outDir: "dist",
    rootDir: ".",
    module: "commonjs",
} as const;

const MODULE_FILE_EXTENSIONS = {
    es6: ".js",
    esnext: ".mjs",
    es2015: ".js",
    es2020: ".mjs",
    es2022: ".mjs",
    node16: ".mjs",
    nodenext: ".mjs",
    // CommonJS
    commonjs: ".js",
    amd: ".js",
    umd: ".js",
    system: ".js",
    none: ".js",
} as const;

/**
 * Determines the output file path for a TypeScript project.
 *
 * @param entryFile - Source file path (e.g., "src/index.ts")
 * @param tsconfigContent - tsconfig.json content as string or object
 * @returns Compiled file path (e.g., "dist/index.js")
 * @throws {Error} If entryFile is invalid
 */
export function getEntryFileTypescript(
    entryFile: string,
    tsconfigContent: string | object,
): string {
    if (!entryFile?.trim()) {
        throw new Error("Entry file path is required");
    }

    const config = parseTypeScriptConfig(tsconfigContent);
    const options = getCompilerOptions(config);

    const normalizedPath = getNormalizedPath(entryFile, options.rootDir);
    const extension = getOutputExtension(
        entryFile,
        options.module,
        options.moduleResolution,
        options.target,
    );
    const outputFileName = normalizedPath.replace(/\.ts$/, extension);

    return path.join(options.outDir, outputFileName);
}

/**
 * Parses the TypeScript configuration from a string or object.
 */
function parseTypeScriptConfig(config: string | object): TypeScriptConfig {
    if (typeof config === "string") {
        try {
            return JSON.parse(config);
        } catch (error) {
            return { compilerOptions: DEFAULT_COMPILER_OPTIONS };
        }
    }
    return config as TypeScriptConfig;
}

/**
 * Extracts and normalizes compiler options with defaults.
 */
function getCompilerOptions(config: TypeScriptConfig) {
    const userOptions = config.compilerOptions ?? {};

    const inferredRootDir = config.include?.[0]?.replace(/[*\\/]+$/, ""); // "src*" -> "src"

    return {
        outDir: userOptions.outDir ?? DEFAULT_COMPILER_OPTIONS.outDir,
        rootDir: userOptions.rootDir ?? inferredRootDir ?? DEFAULT_COMPILER_OPTIONS.rootDir,
        module: userOptions.module ?? DEFAULT_COMPILER_OPTIONS.module,
        moduleResolution: userOptions.moduleResolution,
        target: userOptions.target,
    };
}

/**
 * Normalizes the input file path relative to rootDir.
 */
function getNormalizedPath(entryFile: string, rootDir: string): string {
    const relativePath = entryFile.startsWith(rootDir)
        ? entryFile.slice(rootDir.length).replace(/^[/\\]+/, "")
        : path.relative(rootDir, entryFile);
    return relativePath.replace(/\\/g, "/");
}

/**
 * Determines the output file extension based on the module type and input file extension.
 */
function getOutputExtension(
    entryFile: string,
    moduleType: string,
    moduleResolution?: string,
    target?: string,
): string {
    // Handle explicit TypeScript module extensions first
    if (entryFile.endsWith(".mts")) return ".mjs";
    if (entryFile.endsWith(".cts")) return ".cjs";
    if (entryFile.endsWith(".ts")) {
        // Handle TypeScript files with explicit module resolution
        const normalizedModule = moduleType?.toLowerCase() || "commonjs";
        const normalizedResolution = moduleResolution?.toLowerCase();

        // NodeNext and Node16 resolution takes precedence
        if (normalizedResolution === "nodenext" || normalizedResolution === "node16") {
            return normalizedModule === "commonjs" ? ".cjs" : ".mjs";
        }

        // Node resolution always outputs .js
        if (normalizedResolution === "node") {
            return ".js";
        }

        // Modern ECMAScript targets should use .mjs
        if (target && target.toLowerCase().startsWith("es")) {
            const version = parseInt(target.substring(2));
            if (!isNaN(version) && version >= 2020) {
                return ".mjs";
            }
        }

        // Fallback to module-specific extensions
        return (
            MODULE_FILE_EXTENSIONS[normalizedModule as keyof typeof MODULE_FILE_EXTENSIONS] ?? ".js"
        );
    }

    // For non-TypeScript files, preserve the original extension
    return path.extname(entryFile);
}
