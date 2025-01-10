import { promises as fs } from "fs";
import path from "path";
import { GenezioAnalyzeOptions } from "../../models/commandOptions.js";
import { debugLogger, log } from "../../utils/logging.js";
import {
    isExpressBackend,
    isFastifyBackend,
    isNextjsComponent,
    isNitroComponent,
    isNuxtComponent,
    isReactComponent,
    isViteComponent,
    isServerlessHttpBackend,
    isVueComponent,
    isAngularComponent,
    isSvelteComponent,
    isFlaskComponent,
    isDjangoComponent,
    isFastAPIComponent,
    isPythonLambdaFunction,
    findEntryFile,
    isGenezioTypesafe,
    hasPostgresDependency,
    hasMongoDependency,
    isNestjsComponent,
    isRemixComponent,
} from "./frameworks.js";
import { generateDatabaseName, readOrAskConfig } from "../deploy/utils.js";
import {
    NODE_DEFAULT_PACKAGE_MANAGER,
    packageManagers,
    PYTHON_DEFAULT_PACKAGE_MANAGER,
} from "../../packageManagers/packageManager.js";
import { SSRFrameworkComponentType } from "../../models/projectOptions.js";
import { RawYamlProjectConfiguration, YAMLLanguage } from "../../projectConfiguration/yaml/v2.js";
import {
    addBackendComponentToConfig,
    addFrontendComponentToConfig,
    addServicesToConfig,
    addSSRComponentToConfig,
    getFrontendPrefix,
    getPythonHandler,
    injectBackendApiUrlsInConfig,
    injectSDKInConfig,
} from "./utils.js";
import { DatabaseType, FunctionType, Language } from "../../projectConfiguration/yaml/models.js";
import { report } from "./outputUtils.js";
import { isCI } from "../../utils/process.js";
import {
    DJANGO_PATTERN,
    EXPRESS_PATTERN,
    FASTAPI_PATTERN,
    FASTIFY_PATTERN,
    FLASK_PATTERN,
    PYTHON_LAMBDA_PATTERN,
    SERVERLESS_HTTP_PATTERN,
} from "./constants.js";
import { analyzeEnvironmentVariableExampleFile, ProjectEnvironment } from "./agent.js";

// backend javascript: aws-compatible functions, serverless-http functions, express, fastify
// backend typescript: aws-compatible functions, serverless-http functions, express, fastify
// backend python: aws-compatible functions, flask, django
// frontend: react, vite, vue, angular, svelte
// ssr: next, nuxt, nitro
// containers
// services: databases, authentication, crons, cache/redis, queues

// Warning: Changing this type will break compatibility across the codebase
// Specifically, it is used in the dashboard to display the detected components
export type FrameworkReport = {
    backend?: BaseComponent[];
    frontend?: BaseComponent[];
    ssr?: BaseComponent[];
    services?: FrameworkReportService[];
};

// Warning: Changing this type will break compatibility across the codebase
// Specifically, it is used in the dashboard to display the detected components
export type FrameworkReportService = {
    databases?: string[];
};

// Warning: Changing this type will break compatibility across the codebase
// Specifically, it is used in the dashboard to display the detected components
export type BaseComponent = {
    component: string;
    path?: string;
    environment?: ProjectEnvironment[];
};

export enum FRONTEND_ENV_PREFIX {
    React = "REACT_APP",
    Vite = "VITE",
    Vue = "VUE_APP",
}

export enum SUPPORTED_FORMATS {
    JSON = "json",
    LIST = "list",
    MARKDOWN = "markdown",
    TEXT = "text",
}

export const DEFAULT_FORMAT = SUPPORTED_FORMATS.TEXT;
export const DEFAULT_CI_FORMAT = SUPPORTED_FORMATS.JSON;

export const KEY_DEPENDENCY_FILES = ["package.json", "requirements.txt", "pyproject.toml"];
export const ENVIRONMENT_EXAMPLE_FILES = [
    ".env.template",
    ".env.example",
    ".env.local.example",
    ".env.sample",
];
export const KEY_FILES = [...KEY_DEPENDENCY_FILES, ...ENVIRONMENT_EXAMPLE_FILES];

export const EXCLUDED_DIRECTORIES = [
    "node_modules",
    ".git",
    "dist",
    "build",
    "tests",
    ".next",
    ".nuxt",
    ".opennext",
    ".vercel",
    ".netlify",
];

export const NODE_DEFAULT_ENTRY_FILE = "index.mjs";
export const PYTHON_DEFAULT_ENTRY_FILE = "app.py";

// The analyze command has 2 side effects:
// 1. It creates a new yaml with the detected components
// 2. Reports the detected components to stdout
export async function analyzeCommand(options: GenezioAnalyzeOptions) {
    const frameworksDetected: FrameworkReport = {};
    const configPath = options.config;
    const rootDirectory = process.cwd();
    const format = isCI() ? options.format || DEFAULT_CI_FORMAT : options.format || DEFAULT_FORMAT;

    // Search the key files in the root directory and return a map of filenames and relative paths
    const componentFiles = await findKeyFiles(rootDirectory);

    // Early return and let the user write the configs, from our perspective seems like there's nothing to be deployed
    if (componentFiles.size === 0) {
        frameworksDetected.backend = frameworksDetected.backend || [];
        frameworksDetected.backend?.push({
            component: "other",
        });
        frameworksDetected.frontend = frameworksDetected.frontend || [];
        frameworksDetected.frontend.push({
            component: "other",
        });
        const result = report(format, frameworksDetected, {} as RawYamlProjectConfiguration);
        log.info(result);
        return;
    }
    debugLogger.debug("Key component files found:", componentFiles);

    // Create a configuration object to add components to
    let genezioConfig = (await readOrAskConfig(configPath)) as RawYamlProjectConfiguration;

    // The order of the components matters - the first one found will be added to the config
    const dependenciesFiles = new Map(
        Array.from(componentFiles).filter(([_, filename]) =>
            KEY_DEPENDENCY_FILES.includes(filename),
        ),
    );
    for (const [relativeFilePath, filename] of dependenciesFiles.entries()) {
        const fileContent = await retrieveFileContent(relativeFilePath);
        const contents: Record<string, string> = {
            [filename]: fileContent,
        };

        // Check for services (postgres, mongo)
        if (await hasPostgresDependency(contents, filename)) {
            genezioConfig = await addServicesToConfig(configPath, {
                databases: [
                    {
                        name: await generateDatabaseName("postgres"),
                        type: DatabaseType.neon,
                    },
                ],
            });

            frameworksDetected.services = frameworksDetected.services || [];
            frameworksDetected.services.push({ databases: ["postgres"] });
        }
        if (await hasMongoDependency(contents, filename)) {
            genezioConfig = await addServicesToConfig(configPath, {
                databases: [
                    {
                        name: await generateDatabaseName("mongo"),
                        type: DatabaseType.mongo,
                    },
                ],
            });

            frameworksDetected.services = frameworksDetected.services || [];
            frameworksDetected.services.push({ databases: ["mongo"] });
        }
    }

    // Extract the environment example files
    const envExampleFiles = new Map(
        Array.from(componentFiles).filter(([_, filename]) =>
            ENVIRONMENT_EXAMPLE_FILES.includes(filename),
        ),
    );
    const resultEnvironmentAnalysis = await analyzeEnvironmentFilesConcurrently(
        envExampleFiles,
        genezioConfig,
    );

    for (const [relativeFilePath, filename] of dependenciesFiles.entries()) {
        const componentPath = path.dirname(relativeFilePath);

        const fileContent = await retrieveFileContent(relativeFilePath);
        const contents: Record<string, string> = {
            [filename]: fileContent,
        };

        // Check for frameworks (backend, frontend, ssr, container)
        if (await isServerlessHttpBackend(contents)) {
            const entryFile = await findEntryFile(
                componentPath,
                contents,
                SERVERLESS_HTTP_PATTERN,
                NODE_DEFAULT_ENTRY_FILE,
            );
            debugLogger.debug("Serverless HTTP entry file found:", entryFile);

            // TODO: Add support for detecting and building typescript backends
            // const isTypescriptFlag = await isTypescript(contents);

            const packageManagerType =
                genezioConfig.backend?.language?.packageManager || NODE_DEFAULT_PACKAGE_MANAGER;
            const packageManager = packageManagers[packageManagerType];
            await addBackendComponentToConfig(configPath, {
                path: componentPath,
                language: {
                    // TODO: Add support for detecting and building typescript backends
                    name: Language.js,
                } as YAMLLanguage,
                scripts: {
                    deploy: [`${packageManager.command} install`],
                    local: [`${packageManager.command} install`],
                },
                environment: mapEnvironmentVariableToConfig(
                    resultEnvironmentAnalysis.get(componentPath)?.environmentVariables,
                ),
                functions: [
                    {
                        name: "serverless",
                        path: ".",
                        // TODO: This is hardcoded because there are great chances that this indeed called `handler`
                        handler: "handler",
                        entry: entryFile,
                        type: FunctionType.aws,
                    },
                ],
            });
            frameworksDetected.backend = frameworksDetected.backend || [];
            frameworksDetected.backend.push({
                component: "serverless-http",
                environment: resultEnvironmentAnalysis.get(componentPath)?.environmentVariables,
            });
            continue;
        }

        if (await isNestjsComponent(contents)) {
            const packageManagerType =
                genezioConfig.nestjs?.packageManager || NODE_DEFAULT_PACKAGE_MANAGER;
            const packageManager = packageManagers[packageManagerType];
            await addSSRComponentToConfig(
                options.config,
                {
                    path: componentPath,
                    packageManager: packageManagerType,
                    environment: mapEnvironmentVariableToConfig(
                        resultEnvironmentAnalysis.get(componentPath)?.environmentVariables,
                    ),
                    scripts: {
                        deploy: [`${packageManager.command} install`],
                    },
                },
                SSRFrameworkComponentType.nestjs,
            );
            frameworksDetected.ssr = frameworksDetected.ssr || [];
            frameworksDetected.ssr.push({
                component: "nestjs",
                environment: resultEnvironmentAnalysis.get(componentPath)?.environmentVariables,
            });
            continue;
        }

        if (await isRemixComponent(contents)) {
            const packageManagerType =
                genezioConfig.remix?.packageManager || NODE_DEFAULT_PACKAGE_MANAGER;
            const packageManager = packageManagers[packageManagerType];
            await addSSRComponentToConfig(
                options.config,
                {
                    path: componentPath,
                    packageManager: packageManagerType,
                    environment: mapEnvironmentVariableToConfig(
                        resultEnvironmentAnalysis.get(componentPath)?.environmentVariables,
                    ),
                    scripts: {
                        build: [`${packageManager.command} run build`],
                        deploy: [
                            `${packageManager.command} install`,
                            `${packageManager.command} run build`,
                        ],
                    },
                },
                SSRFrameworkComponentType.remix,
            );
            frameworksDetected.ssr = frameworksDetected.ssr || [];
            frameworksDetected.ssr.push({
                component: "remix",
                environment: resultEnvironmentAnalysis.get(componentPath)?.environmentVariables,
            });
            continue;
        }

        if (await isExpressBackend(contents)) {
            const entryFile = await findEntryFile(
                componentPath,
                contents,
                EXPRESS_PATTERN,
                NODE_DEFAULT_ENTRY_FILE,
            );
            debugLogger.debug("Express entry file found:", entryFile);

            // TODO: Add support for detecting and building typescript backends
            // const isTypescriptFlag = await isTypescript(contents);
            const packageManagerType =
                genezioConfig.backend?.language?.packageManager || NODE_DEFAULT_PACKAGE_MANAGER;
            const packageManager = packageManagers[packageManagerType];
            await addBackendComponentToConfig(configPath, {
                path: componentPath,
                language: {
                    // TODO: Add support for detecting and building typescript backends
                    name: Language.js,
                } as YAMLLanguage,
                environment: mapEnvironmentVariableToConfig(
                    resultEnvironmentAnalysis.get(componentPath)?.environmentVariables,
                ),
                scripts: {
                    deploy: [`${packageManager.command} install`],
                    local: [`${packageManager.command} install`],
                },
                functions: [
                    {
                        name: "express",
                        path: ".",
                        entry: entryFile,
                        type: FunctionType.httpServer,
                    },
                ],
            });
            frameworksDetected.backend = frameworksDetected.backend || [];
            frameworksDetected.backend.push({
                component: "express",
                environment: resultEnvironmentAnalysis.get(componentPath)?.environmentVariables,
            });
            continue;
        }

        if (await isFastifyBackend(contents)) {
            const entryFile = await findEntryFile(
                componentPath,
                contents,
                FASTIFY_PATTERN,
                NODE_DEFAULT_ENTRY_FILE,
            );
            debugLogger.debug("Fastify entry file found:", entryFile);

            // TODO: Add support for detecting and building typescript backends
            // const isTypescriptFlag = await isTypescript(contents);
            const packageManagerType =
                genezioConfig.backend?.language?.packageManager || NODE_DEFAULT_PACKAGE_MANAGER;
            const packageManager = packageManagers[packageManagerType];
            await addBackendComponentToConfig(configPath, {
                path: componentPath,
                language: {
                    // TODO: Add support for detecting and building typescript backends
                    name: Language.js,
                } as YAMLLanguage,
                scripts: {
                    deploy: [`${packageManager.command} install`],
                    local: [`${packageManager.command} install`],
                },
                environment: mapEnvironmentVariableToConfig(
                    resultEnvironmentAnalysis.get(componentPath)?.environmentVariables,
                ),
                functions: [
                    {
                        name: "fastify",
                        path: ".",
                        entry: entryFile,
                        type: FunctionType.httpServer,
                    },
                ],
            });
            frameworksDetected.backend = frameworksDetected.backend || [];
            frameworksDetected.backend.push({
                component: "fastify",
                environment: resultEnvironmentAnalysis.get(componentPath)?.environmentVariables,
            });
            continue;
        }

        if (await isNextjsComponent(contents)) {
            const packageManagerType =
                genezioConfig.nestjs?.packageManager || NODE_DEFAULT_PACKAGE_MANAGER;
            const packageManager = packageManagers[packageManagerType];
            await addSSRComponentToConfig(
                options.config,
                {
                    path: componentPath,
                    packageManager: packageManagerType,
                    environment: mapEnvironmentVariableToConfig(
                        resultEnvironmentAnalysis.get(componentPath)?.environmentVariables,
                    ),
                    scripts: {
                        deploy: [`${packageManager.command} install`],
                    },
                },
                SSRFrameworkComponentType.next,
            );
            frameworksDetected.ssr = frameworksDetected.ssr || [];
            frameworksDetected.ssr.push({
                component: "next",
                environment: resultEnvironmentAnalysis.get(componentPath)?.environmentVariables,
            });
            continue;
        }

        if (await isNuxtComponent(contents)) {
            const packageManagerType =
                genezioConfig.nuxt?.packageManager || NODE_DEFAULT_PACKAGE_MANAGER;
            const packageManager = packageManagers[packageManagerType];

            await addSSRComponentToConfig(
                options.config,
                {
                    path: componentPath,
                    packageManager: packageManagerType,
                    environment: mapEnvironmentVariableToConfig(
                        resultEnvironmentAnalysis.get(componentPath)?.environmentVariables,
                    ),
                    scripts: {
                        deploy: [`${packageManager.command} install`],
                    },
                },
                SSRFrameworkComponentType.nuxt,
            );
            frameworksDetected.ssr = frameworksDetected.ssr || [];
            frameworksDetected.ssr.push({
                component: "nuxt",
                environment: resultEnvironmentAnalysis.get(componentPath)?.environmentVariables,
            });
            continue;
        }

        if (await isNitroComponent(contents)) {
            const packageManagerType =
                genezioConfig.nitro?.packageManager || NODE_DEFAULT_PACKAGE_MANAGER;
            const packageManager = packageManagers[packageManagerType];

            await addSSRComponentToConfig(
                options.config,
                {
                    path: componentPath,
                    packageManager: packageManagerType,
                    environment: mapEnvironmentVariableToConfig(
                        resultEnvironmentAnalysis.get(componentPath)?.environmentVariables,
                    ),
                    scripts: {
                        deploy: [`${packageManager.command} install`],
                    },
                },
                SSRFrameworkComponentType.nitro,
            );
            frameworksDetected.ssr = frameworksDetected.ssr || [];
            frameworksDetected.ssr.push({
                component: "nitro",
                environment: resultEnvironmentAnalysis.get(componentPath)?.environmentVariables,
            });
            continue;
        }

        if (await isVueComponent(contents)) {
            const packageManagerType = NODE_DEFAULT_PACKAGE_MANAGER;
            const packageManager = packageManagers[packageManagerType];
            await addFrontendComponentToConfig(configPath, {
                path: componentPath,
                publish: path.join(componentPath, "dist"),
                scripts: {
                    deploy: [`${packageManager.command} install`],
                    build: [`${packageManager.command} run build`],
                },
            });
            frameworksDetected.frontend = frameworksDetected.frontend || [];
            frameworksDetected.frontend.push({
                component: "vue",
                environment: resultEnvironmentAnalysis.get(componentPath)?.environmentVariables,
            });
            continue;
        }

        if (await isAngularComponent(contents)) {
            const packageManagerType = NODE_DEFAULT_PACKAGE_MANAGER;
            const packageManager = packageManagers[packageManagerType];
            await addFrontendComponentToConfig(configPath, {
                path: componentPath,
                publish: path.join("dist", "browser"),
                scripts: {
                    deploy: [`${packageManager.command} install`],
                    build: [`${packageManager.command} run build`],
                },
            });
            frameworksDetected.frontend = frameworksDetected.frontend || [];
            frameworksDetected.frontend.push({
                component: "angular",
                environment: resultEnvironmentAnalysis.get(componentPath)?.environmentVariables,
            });
            continue;
        }

        if (await isSvelteComponent(contents)) {
            const packageManagerType = NODE_DEFAULT_PACKAGE_MANAGER;
            const packageManager = packageManagers[packageManagerType];
            await addFrontendComponentToConfig(configPath, {
                path: componentPath,
                publish: "dist",
                scripts: {
                    deploy: [`${packageManager.command} install`],
                    build: [`${packageManager.command} run build`],
                },
            });
            frameworksDetected.frontend = frameworksDetected.frontend || [];
            frameworksDetected.frontend.push({
                component: "svelte",
                environment: resultEnvironmentAnalysis.get(componentPath)?.environmentVariables,
            });
            continue;
        }

        if (await isViteComponent(contents)) {
            if (await isRemixComponent(contents)) {
                const packageManagerType =
                    genezioConfig.remix?.packageManager || NODE_DEFAULT_PACKAGE_MANAGER;
                const packageManager = packageManagers[packageManagerType];
                await addSSRComponentToConfig(
                    options.config,
                    {
                        path: componentPath,
                        packageManager: packageManagerType,
                        environment: mapEnvironmentVariableToConfig(
                            resultEnvironmentAnalysis.get(componentPath)?.environmentVariables,
                        ),
                        scripts: {
                            build: [`${packageManager.command} run build`],
                            deploy: [
                                `${packageManager.command} install`,
                                `${packageManager.command} run build`,
                            ],
                        },
                    },
                    SSRFrameworkComponentType.remix,
                );
                frameworksDetected.ssr = frameworksDetected.ssr || [];
                frameworksDetected.ssr.push({
                    component: "remix",
                    environment: resultEnvironmentAnalysis.get(componentPath)?.environmentVariables,
                });
                continue;
            }

            const packageManagerType = NODE_DEFAULT_PACKAGE_MANAGER;
            const packageManager = packageManagers[packageManagerType];
            await addFrontendComponentToConfig(configPath, {
                path: componentPath,
                publish: "dist",
                scripts: {
                    deploy: [`${packageManager.command} install`],
                    build: [`${packageManager.command} run build`],
                },
            });
            frameworksDetected.frontend = frameworksDetected.frontend || [];
            frameworksDetected.frontend.push({
                component: "vite",
                environment: resultEnvironmentAnalysis.get(componentPath)?.environmentVariables,
            });
            continue;
        }

        if (await isReactComponent(contents)) {
            const packageManagerType = NODE_DEFAULT_PACKAGE_MANAGER;
            const packageManager = packageManagers[packageManagerType];
            await addFrontendComponentToConfig(configPath, {
                path: componentPath,
                publish: "build",
                scripts: {
                    deploy: [`${packageManager.command} install`],
                    build: [`${packageManager.command} run build`],
                },
            });
            frameworksDetected.frontend = frameworksDetected.frontend || [];
            frameworksDetected.frontend.push({
                component: "react",
                environment: resultEnvironmentAnalysis.get(componentPath)?.environmentVariables,
            });
            continue;
        }

        if (await isGenezioTypesafe(contents)) {
            const packageManagerType = NODE_DEFAULT_PACKAGE_MANAGER;
            const packageManager = packageManagers[packageManagerType];
            await addBackendComponentToConfig(configPath, {
                path: componentPath,
                // TODO: Add support for detecting the language of the backend
                language: {
                    name: Language.ts,
                } as YAMLLanguage,
                scripts: {
                    deploy: [`${packageManager.command} install`],
                    local: [`${packageManager.command} install`],
                },
            });
            frameworksDetected.backend = frameworksDetected.backend || [];
            frameworksDetected.backend.push({ component: "genezio-typesafe" });
            continue;
        }

        if (await isFlaskComponent(contents)) {
            const entryFile = await findEntryFile(
                componentPath,
                contents,
                FLASK_PATTERN,
                PYTHON_DEFAULT_ENTRY_FILE,
            );
            const fullpath = path.join(componentPath, entryFile);
            const entryFileContent = await retrieveFileContent(fullpath);
            const pythonHandler = getPythonHandler(entryFileContent);

            const packageManagerType =
                genezioConfig.backend?.language?.packageManager || PYTHON_DEFAULT_PACKAGE_MANAGER;

            await addBackendComponentToConfig(configPath, {
                path: componentPath,
                language: {
                    name: Language.python,
                    packageManager: packageManagerType,
                } as YAMLLanguage,
                environment: mapEnvironmentVariableToConfig(
                    resultEnvironmentAnalysis.get(componentPath)?.environmentVariables,
                ),
                functions: [
                    {
                        name: "flask",
                        path: ".",
                        handler: pythonHandler,
                        entry: entryFile,
                        type: FunctionType.httpServer,
                    },
                ],
            });

            frameworksDetected.backend = frameworksDetected.backend || [];
            frameworksDetected.backend.push({
                component: "flask",
                environment: resultEnvironmentAnalysis.get(componentPath)?.environmentVariables,
            });
            continue;
        }

        if (await isDjangoComponent(contents)) {
            const entryFile = await findEntryFile(
                componentPath,
                contents,
                DJANGO_PATTERN,
                "wsgi.py",
            );

            const packageManagerType =
                genezioConfig.backend?.language?.packageManager || PYTHON_DEFAULT_PACKAGE_MANAGER;
            await addBackendComponentToConfig(configPath, {
                path: componentPath,
                language: {
                    name: Language.python,
                    packageManager: packageManagerType,
                } as YAMLLanguage,
                environment: mapEnvironmentVariableToConfig(
                    resultEnvironmentAnalysis.get(componentPath)?.environmentVariables,
                ),
                functions: [
                    {
                        name: "django",
                        path: ".",
                        handler: "application",
                        entry: entryFile,
                        type: FunctionType.httpServer,
                    },
                ],
            });

            frameworksDetected.backend = frameworksDetected.backend || [];
            frameworksDetected.backend.push({
                component: "django",
                environment: resultEnvironmentAnalysis.get(componentPath)?.environmentVariables,
            });
            continue;
        }

        if (await isFastAPIComponent(contents)) {
            const entryFile = await findEntryFile(
                componentPath,
                contents,
                FASTAPI_PATTERN,
                PYTHON_DEFAULT_ENTRY_FILE,
            );
            const fullpath = path.join(componentPath, entryFile);
            const entryFileContent = await retrieveFileContent(fullpath);
            const pythonHandler = getPythonHandler(entryFileContent);

            const packageManagerType =
                genezioConfig.backend?.language?.packageManager || PYTHON_DEFAULT_PACKAGE_MANAGER;
            await addBackendComponentToConfig(configPath, {
                path: componentPath,
                language: {
                    name: Language.python,
                    packageManager: packageManagerType,
                } as YAMLLanguage,
                environment: mapEnvironmentVariableToConfig(
                    resultEnvironmentAnalysis.get(componentPath)?.environmentVariables,
                ),
                functions: [
                    {
                        name: "fastapi",
                        path: ".",
                        handler: pythonHandler,
                        entry: entryFile,
                        type: FunctionType.httpServer,
                    },
                ],
            });

            frameworksDetected.backend = frameworksDetected.backend || [];
            frameworksDetected.backend.push({
                component: "fastapi",
                environment: resultEnvironmentAnalysis.get(componentPath)?.environmentVariables,
            });
            continue;
        }

        if (await isPythonLambdaFunction(contents)) {
            const entryFile = await findEntryFile(
                componentPath,
                contents,
                PYTHON_LAMBDA_PATTERN,
                PYTHON_DEFAULT_ENTRY_FILE,
            );

            const packageManagerType =
                genezioConfig.backend?.language?.packageManager || PYTHON_DEFAULT_PACKAGE_MANAGER;
            await addBackendComponentToConfig(configPath, {
                path: componentPath,
                language: {
                    name: Language.python,
                    packageManager: packageManagerType,
                } as YAMLLanguage,
                environment: mapEnvironmentVariableToConfig(
                    resultEnvironmentAnalysis.get(componentPath)?.environmentVariables,
                ),
                functions: [
                    {
                        name: "serverless",
                        path: ".",
                        handler: "handler",
                        entry: entryFile,
                        type: FunctionType.aws,
                    },
                ],
            });
            frameworksDetected.backend = frameworksDetected.backend || [];
            frameworksDetected.backend.push({
                component: "python-lambda",
                environment: resultEnvironmentAnalysis.get(componentPath)?.environmentVariables,
            });
            continue;
        }
    }

    // Inject Backend API URLs into the frontend component
    // This is done after all the components have been detected
    if (
        ((frameworksDetected.backend && frameworksDetected.backend.length > 0) ||
            (frameworksDetected.ssr && frameworksDetected.ssr.length > 0)) &&
        !frameworksDetected.backend?.some((entry) =>
            entry.component.includes("genezio-typesafe"),
        ) &&
        frameworksDetected.frontend &&
        frameworksDetected.frontend.length > 0
    ) {
        // TODO Support multiple frontend frameworks in the same project
        const frontendPrefix = getFrontendPrefix(frameworksDetected.frontend[0].component);
        await injectBackendApiUrlsInConfig(configPath, frontendPrefix);
    }

    if (
        frameworksDetected.backend?.some((entry) => entry.component.includes("genezio-typesafe")) &&
        frameworksDetected.frontend &&
        frameworksDetected.frontend.length > 0
    ) {
        // TODO Support multiple frontend frameworks in the same project
        await injectSDKInConfig(configPath);
    }

    // Report the detected frameworks at stdout
    const result = report(format, frameworksDetected, genezioConfig);
    log.info(result);
}

type EnvironmentAnalysisResult = Map<string, { environmentVariables: ProjectEnvironment[] }>;

async function analyzeEnvironmentFilesConcurrently(
    envExampleFiles: Map<string, string>,
    genezioConfig: RawYamlProjectConfiguration,
): Promise<EnvironmentAnalysisResult> {
    if (envExampleFiles.size === 0) {
        return new Map();
    }

    const envExampleContents = new Map<string, string>();
    const resultEnvironmentAnalysis: EnvironmentAnalysisResult = new Map();
    await Promise.all(
        Array.from(envExampleFiles.entries()).map(async ([relativeFilePath, filename]) => {
            const componentPath = path.dirname(relativeFilePath);
            const fileContent = await retrieveFileContent(relativeFilePath);
            envExampleContents.set(filename, fileContent);

            // Analyze the environment example file
            const environmentVariablesAnalysis = await analyzeEnvironmentVariableExampleFile(
                fileContent,
                genezioConfig.services,
            );

            if (environmentVariablesAnalysis.length === 0) {
                return;
            }

            resultEnvironmentAnalysis.set(componentPath, {
                environmentVariables: environmentVariablesAnalysis,
            });
        }),
    );

    return resultEnvironmentAnalysis;
}

/**
 * Filters and transforms environment variables from a list of ProjectEnvironment.
 * @param envAnalysis - Array of ProjectEnvironment objects.
 * @returns A record mapping environment keys to default values.
 */
function mapEnvironmentVariableToConfig(
    environmentVariables: ProjectEnvironment[] | undefined,
): Record<string, string> {
    if (!environmentVariables || environmentVariables.length === 0) {
        return {};
    }
    return environmentVariables
        .filter((env: ProjectEnvironment) => /\$\{\{.*\}\}/.test(env.defaultValue))
        .reduce((acc: Record<string, string>, env: ProjectEnvironment) => {
            acc[env.key] = env.defaultValue;
            return acc;
        }, {});
}

/**
 * This is costly so we should try to call it as few times as possible
 */
export const findKeyFiles = async (
    dir: string,
    keyFiles: string[] = KEY_FILES,
): Promise<Map<string, string>> => {
    const result = new Map<string, string>();

    const searchDir = async (currentDir: string) => {
        const entries = await fs.readdir(currentDir, { withFileTypes: true });

        await Promise.all(
            entries.map(async (entry) => {
                const fullPath = path.join(currentDir, entry.name);

                if (entry.isDirectory()) {
                    // Skip excluded directories
                    if (EXCLUDED_DIRECTORIES.includes(entry.name)) return;

                    // Recursively search subdirectory
                    await searchDir(fullPath);
                } else if (keyFiles.includes(entry.name)) {
                    // If the file is one of the key files, add it to the map
                    const relativePath = path.relative(dir, fullPath);
                    result.set(relativePath, entry.name);
                }
            }),
        );
    };

    await searchDir(dir);
    return result;
};

// Method to read the contents of a file
async function retrieveFileContent(filePath: string): Promise<string> {
    try {
        await fs.access(filePath);
    } catch (error) {
        log.error(`Cannot access ${filePath}: ${error}`);
        return "";
    }

    try {
        // Read and return the file content
        const fileContent = await fs.readFile(filePath, "utf-8");
        return fileContent;
    } catch (error) {
        log.error(`Error reading file at ${filePath}: ${error}`);
        return "";
    }
}
