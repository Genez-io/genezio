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
    getEntryfile,
    isVueComponent,
    isAngularComponent,
    isSvelteComponent,
    isContainerComponent,
} from "./frameworks.js";
import { readOrAskConfig } from "../deploy/utils.js";
import { getPackageManager, PackageManagerType } from "../../packageManagers/packageManager.js";
import { SSRFrameworkComponentType } from "../../models/projectOptions.js";
import { RawYamlProjectConfiguration, YAMLLanguage } from "../../projectConfiguration/yaml/v2.js";
import {
    addBackendComponentToConfig,
    addContainerComponentToConfig,
    addFrontendComponentToConfig,
    addSSRComponentToConfig,
    getFrontendPrefix,
    injectBackendApiUrlsInConfig,
} from "./utils.js";
import { FunctionType, Language } from "../../projectConfiguration/yaml/models.js";
import { report } from "./outputUtils.js";
import { isCI } from "../../utils/process.js";

// backend javascript: aws-compatible functions, serverless-http functions, express, fastify
// backend typescript: aws-compatible functions, serverless-http functions, express, fastify
// backend python: aws-compatible functions, flask, django
// frontend: react, vite, vue, angular, svelte
// ssr: next, nuxt, nitro
// containers
// services: databases, authentication, crons, cache/redis, queues
export type FrameworkReport = {
    backend?: string[];
    frontend?: string[];
    ssr?: string[];
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

export const KEY_FILES = ["package.json", "Dockerfile"];
export const EXCLUDED_DIRECTORIES = ["node_modules", ".git", "dist", "build"];

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
        frameworksDetected.backend.push("other");
        frameworksDetected.frontend = frameworksDetected.frontend || [];
        frameworksDetected.frontend.push("other");
        const result = report(format, frameworksDetected, {} as RawYamlProjectConfiguration);
        log.info(result);
        return;
    }

    debugLogger.debug("Key component files found:", componentFiles);

    // Create a configuration object to add components to
    const genezioConfig = (await readOrAskConfig(configPath)) as RawYamlProjectConfiguration;

    // The order of the components matters - the first one found will be added to the config
    // The `component` label is used to break out of the if
    for (const [relativeFilePath, filename] of componentFiles.entries()) {
        const componentPath = path.dirname(relativeFilePath);

        const fileContent = await retrieveFileContent(relativeFilePath);
        const contents: Record<string, string> = {
            [filename]: fileContent,
        };

        if (await isServerlessHttpBackend(contents)) {
            const entryfile = await getEntryfile(contents);
            // TODO: Add support for detecting and building typescript backends
            // const isTypescriptFlag = await isTypescript(contents);

            await addBackendComponentToConfig(configPath, {
                path: componentPath,
                language: {
                    // TODO: Add support for detecting and building typescript backends
                    name: Language.js,
                } as YAMLLanguage,
                scripts: {
                    deploy: [`${getPackageManager().command} install`],
                    local: [`${getPackageManager().command} install`],
                },
                functions: [
                    {
                        name: "serverless",
                        path: ".",
                        // TODO: This is hardcoded because there are great chances that this indeed called `handler`
                        handler: "handler",
                        entry: entryfile,
                        type: FunctionType.aws,
                    },
                ],
            });
            frameworksDetected.backend = frameworksDetected.backend || [];
            frameworksDetected.backend.push("serverless-http");
            continue;
        }

        if (await isExpressBackend(contents)) {
            const entryfile = await getEntryfile(contents);
            // TODO: Add support for detecting and building typescript backends
            // const isTypescriptFlag = await isTypescript(contents);

            await addBackendComponentToConfig(configPath, {
                path: componentPath,
                language: {
                    // TODO: Add support for detecting and building typescript backends
                    name: Language.js,
                } as YAMLLanguage,
                scripts: {
                    deploy: [`${getPackageManager().command} install`],
                    local: [`${getPackageManager().command} install`],
                },
                functions: [
                    {
                        name: "express",
                        path: ".",
                        entry: entryfile,
                        type: FunctionType.httpServer,
                    },
                ],
            });
            frameworksDetected.backend = frameworksDetected.backend || [];
            frameworksDetected.backend.push("express");
            continue;
        }

        if (await isFastifyBackend(contents)) {
            const entryfile = await getEntryfile(contents);
            // TODO: Add support for detecting and building typescript backends
            // const isTypescriptFlag = await isTypescript(contents);

            await addBackendComponentToConfig(configPath, {
                path: componentPath,
                language: {
                    // TODO: Add support for detecting and building typescript backends
                    name: Language.js,
                } as YAMLLanguage,
                scripts: {
                    deploy: [`${getPackageManager().command} install`],
                    local: [`${getPackageManager().command} install`],
                },
                functions: [
                    {
                        name: "fastify",
                        path: ".",
                        entry: entryfile,
                        type: FunctionType.httpServer,
                    },
                ],
            });
            frameworksDetected.backend = frameworksDetected.backend || [];
            frameworksDetected.backend.push("fastify");
            continue;
        }

        if (await isNextjsComponent(contents)) {
            await addSSRComponentToConfig(
                options.config,
                {
                    path: componentPath,
                    packageManager: getPackageManager().command as PackageManagerType,
                    scripts: {
                        deploy: [`${getPackageManager().command} install`],
                    },
                },
                SSRFrameworkComponentType.next,
            );
            frameworksDetected.ssr = frameworksDetected.ssr || [];
            frameworksDetected.ssr.push("next");
            continue;
        }

        if (await isNuxtComponent(contents)) {
            await addSSRComponentToConfig(
                options.config,
                {
                    path: componentPath,
                    packageManager: getPackageManager().command as PackageManagerType,
                    scripts: {
                        deploy: [`${getPackageManager().command} install`],
                    },
                },
                SSRFrameworkComponentType.nuxt,
            );
            frameworksDetected.ssr = frameworksDetected.ssr || [];
            frameworksDetected.ssr.push("nuxt");
            continue;
        }

        if (await isNitroComponent(contents)) {
            await addSSRComponentToConfig(
                options.config,
                {
                    path: componentPath,
                    packageManager: getPackageManager().command as PackageManagerType,
                    scripts: {
                        deploy: [`${getPackageManager().command} install`],
                    },
                },
                SSRFrameworkComponentType.nitro,
            );
            frameworksDetected.ssr = frameworksDetected.ssr || [];
            frameworksDetected.ssr.push("nitro");
            continue;
        }

        if (await isVueComponent(contents)) {
            await addFrontendComponentToConfig(configPath, {
                path: componentPath,
                publish: path.join(componentPath, "dist"),
                scripts: {
                    deploy: [`${getPackageManager().command} install`],
                    build: [`${getPackageManager().command} run build`],
                },
            });
            frameworksDetected.frontend = frameworksDetected.frontend || [];
            frameworksDetected.frontend.push("vue");
            continue;
        }

        if (await isAngularComponent(contents)) {
            await addFrontendComponentToConfig(configPath, {
                path: componentPath,
                publish: path.join("dist", "browser"),
                scripts: {
                    deploy: [`${getPackageManager().command} install`],
                    build: [`${getPackageManager().command} run build`],
                },
            });
            frameworksDetected.frontend = frameworksDetected.frontend || [];
            frameworksDetected.frontend.push("angular");
            continue;
        }

        if (await isSvelteComponent(contents)) {
            await addFrontendComponentToConfig(configPath, {
                path: componentPath,
                publish: "dist",
                scripts: {
                    deploy: [`${getPackageManager().command} install`],
                    build: [`${getPackageManager().command} run build`],
                },
            });
            frameworksDetected.frontend = frameworksDetected.frontend || [];
            frameworksDetected.frontend.push("svelte");
            continue;
        }

        if (await isViteComponent(contents)) {
            await addFrontendComponentToConfig(configPath, {
                path: componentPath,
                publish: "dist",
                scripts: {
                    deploy: [`${getPackageManager().command} install`],
                    build: [`${getPackageManager().command} run build`],
                },
            });
            frameworksDetected.frontend = frameworksDetected.frontend || [];
            frameworksDetected.frontend.push("vite");
            continue;
        }

        if (await isReactComponent(contents)) {
            await addFrontendComponentToConfig(configPath, {
                path: componentPath,
                publish: "build",
                scripts: {
                    deploy: [`${getPackageManager().command} install`],
                    build: [`${getPackageManager().command} run build`],
                },
            });
            frameworksDetected.frontend = frameworksDetected.frontend || [];
            frameworksDetected.frontend.push("react");
            continue;
        }

        if (await isContainerComponent(contents)) {
            addContainerComponentToConfig(configPath, {
                path: componentPath,
            });

            frameworksDetected.backend = frameworksDetected.backend || [];
            frameworksDetected.backend.push("container");
            continue;
        }
    }

    // Inject Backend API URLs into the frontend component
    // This is done after all the components have been detected
    if (
        frameworksDetected.backend &&
        frameworksDetected.backend.length > 0 &&
        frameworksDetected.frontend &&
        frameworksDetected.frontend.length > 0
    ) {
        // TODO Support multiple frontend frameworks in the same project
        const frontendPrefix = getFrontendPrefix(frameworksDetected.frontend[0]);
        await injectBackendApiUrlsInConfig(configPath, frontendPrefix);
    }

    // Report the detected frameworks at stdout
    const result = report(format, frameworksDetected, genezioConfig);
    log.info(result);
}

export const findKeyFiles = async (dir: string): Promise<Map<string, string>> => {
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
                } else if (KEY_FILES.includes(entry.name)) {
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
    // check if file exists

    try {
        const fileContent = await fs.readFile(filePath, "utf-8");
        return fileContent;
    } catch (error) {
        log.error("Error reading package.json:", error);
        return "";
    }
}
