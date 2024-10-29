import { promises as fs } from "fs";
import path from "path";
import { GenezioAnalyzeOptions } from "../../models/commandOptions.js";
import { log } from "../../utils/logging.js";
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
} from "./frameworks.js";
import { addSSRComponentToConfig, readOrAskConfig } from "../deploy/utils.js";
import { getPackageManager, PackageManagerType } from "../../packageManagers/packageManager.js";
import { SSRFrameworkComponentType } from "../../models/projectOptions.js";
import { RawYamlProjectConfiguration, YAMLLanguage } from "../../projectConfiguration/yaml/v2.js";
import { UserError } from "../../errors.js";
import { addBackendComponentToConfig, addFrontendComponentToConfig } from "./utils.js";
import { FunctionType, Language } from "../../projectConfiguration/yaml/models.js";
import { report } from "./outputUtils.js";
import { isCI } from "../../utils/process.js";

// backend javascript: aws-compatible functions, serverless-http functions, express, fastify
// backend typescript: aws-compatible functions, serverless-http functions, express, fastify
// backend python: aws-compatible functions, flask, django
// frontend: react, vite
// ssr: next, nuxt, nitro
// containers
// services: databases, authentication, crons, cache/redis, queues
export type FrameworkReport = {
    backend?: string[];
    frontend?: string[];
    ssr?: string[];
};

export enum SUPPORTED_FORMATS {
    JSON = "json",
    LIST = "list",
    MARKDOWN = "markdown",
    TEXT = "text",
}

const DEFAULT_FORMAT = SUPPORTED_FORMATS.TEXT;
const DEFAULT_CI_FORMAT = SUPPORTED_FORMATS.JSON;

// The analyze command has 2 side effects:
// 1. It creates a new yaml with the detected components
// 2. Reports the detected components to stdout
export async function analyzeCommand(options: GenezioAnalyzeOptions) {
    const frameworksDetected: FrameworkReport = {};
    const configPath = options.config;
    const cwd = process.cwd();
    const rootDirectory = process.cwd();

    // Check if a package.json file exists in the current root directory
    const isPackageJson = await existsPackageJson(rootDirectory);
    if (!isPackageJson) {
        throw new UserError(
            "No package.json file found in the current directory. Could not analyze the project.",
        );
    }

    // Create a configuration object to add components to
    const genezioConfig = (await readOrAskConfig(configPath)) as RawYamlProjectConfiguration;

    // The order of the components matters - the first one found will be added to the config
    // The `component` label is used to break out of the if
    component: if (isPackageJson) {
        const file = path.join(rootDirectory, "package.json");
        const componentPath = path.relative(cwd, path.dirname(file)) || ".";

        // Retrieve the package.json contents
        const packageJsonContent = await retrieveFileContent(file);
        // const tsconfigJsonContent = await retrieveFileContent(
        //     path.join(rootDirectory, "tsconfig.json"),
        // );
        const contents: Record<string, string> = {
            "package.json": packageJsonContent,
            // "tsconfig.json": tsconfigJsonContent,
        };

        if (await isServerlessHttpBackend(contents)) {
            const entryfile = await getEntryfile(contents);
            // TODO: Add support for detecting and building typescript backends
            // const isTypescriptFlag = await isTypescript(contents);

            await addBackendComponentToConfig(configPath, genezioConfig, {
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
                        name: "aws-compatible",
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
            break component;
        }

        if (await isExpressBackend(contents)) {
            const entryfile = await getEntryfile(contents);
            // TODO: Add support for detecting and building typescript backends
            // const isTypescriptFlag = await isTypescript(contents);

            await addBackendComponentToConfig(configPath, genezioConfig, {
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
            break component;
        }

        if (await isFastifyBackend(contents)) {
            const entryfile = await getEntryfile(contents);
            // TODO: Add support for detecting and building typescript backends
            // const isTypescriptFlag = await isTypescript(contents);

            await addBackendComponentToConfig(configPath, genezioConfig, {
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
            break component;
        }

        if (await isNextjsComponent(contents)) {
            await addSSRComponentToConfig(
                options.config,
                genezioConfig,
                {
                    path: componentPath,
                    packageManager: getPackageManager().command as PackageManagerType,
                    scripts: {
                        deploy: getPackageManager().command + " install",
                    },
                },
                SSRFrameworkComponentType.next,
            );
            frameworksDetected.ssr = frameworksDetected.ssr || [];
            frameworksDetected.ssr.push("next");
            break component;
        }

        if (await isNuxtComponent(contents)) {
            await addSSRComponentToConfig(
                options.config,
                genezioConfig,
                {
                    path: componentPath,
                    packageManager: getPackageManager().command as PackageManagerType,
                    scripts: {
                        deploy: getPackageManager().command + " install",
                    },
                },
                SSRFrameworkComponentType.nuxt,
            );
            frameworksDetected.ssr = frameworksDetected.ssr || [];
            frameworksDetected.ssr.push("nuxt");
            break component;
        }

        if (await isNitroComponent(contents)) {
            await addSSRComponentToConfig(
                options.config,
                genezioConfig,
                {
                    path: componentPath,
                    packageManager: getPackageManager().command as PackageManagerType,
                    scripts: {
                        deploy: getPackageManager().command + " install",
                    },
                },
                SSRFrameworkComponentType.nitro,
            );
            frameworksDetected.ssr = frameworksDetected.ssr || [];
            frameworksDetected.ssr.push("nitro");
            break component;
        }

        if (await isViteComponent(contents)) {
            addFrontendComponentToConfig(configPath, genezioConfig, {
                path: componentPath,
                publish: path.join(componentPath, "dist"),
                scripts: {
                    deploy: [`${getPackageManager().command} install`],
                    build: [`${getPackageManager().command} run build`],
                },
            });
            frameworksDetected.frontend = frameworksDetected.frontend || [];
            frameworksDetected.frontend.push("vite");
            break component;
        }

        if (await isReactComponent(contents)) {
            addFrontendComponentToConfig(configPath, genezioConfig, {
                path: componentPath,
                publish: path.join(componentPath, "build"),
                scripts: {
                    deploy: [`${getPackageManager().command} install`],
                    build: [`${getPackageManager().command} run build`],
                },
            });
            frameworksDetected.frontend = frameworksDetected.frontend || [];
            frameworksDetected.frontend.push("react");
            break component;
        }
    }

    // Report the detected frameworks at stdout
    if (isCI()) {
        const result = report(DEFAULT_CI_FORMAT, frameworksDetected, genezioConfig);
        log.info(result);
        return;
    }

    const result = report(DEFAULT_FORMAT, frameworksDetected, genezioConfig);
    log.info(result);
}

// Method to check if a package.json file exists in the directory
async function existsPackageJson(directory: string): Promise<boolean> {
    try {
        const file = path.join(directory, "package.json");
        await fs.access(file);
        return true;
    } catch (error) {
        return false;
    }
}

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
