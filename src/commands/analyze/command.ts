import { promises as fs } from "fs";
import path from "path";
import { GenezioAnalyzeOptions } from "../../models/commandOptions.js";
import { debugLogger, log } from "../../utils/logging.js";
import {
    isNextjsComponent,
    isNitroComponent,
    isNuxtComponent,
    isReactComponent,
    isViteComponent,
} from "./frameworks.js";
import { addSSRComponentToConfig, readOrAskConfig } from "../deploy/utils.js";
import { getPackageManager, PackageManagerType } from "../../packageManagers/packageManager.js";
import { SSRFrameworkComponentType } from "../../models/projectOptions.js";
import { RawYamlProjectConfiguration } from "../../projectConfiguration/yaml/v2.js";
import { UserError } from "../../errors.js";
import { SSRFrameworkComponent } from "../deploy/command.js";
import { addFrontendComponentToConfig } from "./utils.js";

export async function analyzeCommand(options: GenezioAnalyzeOptions) {
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
        const contents: Record<string, string> = { "package.json": packageJsonContent };

        debugLogger.debug(`Found package.json: ${contents["package.json"]}`);

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
            break component;
        }

        if (await isViteComponent(contents)) {
            addFrontendComponentToConfig(configPath, genezioConfig, {
                path: componentPath,
                publish: path.join(componentPath, "build"),
                scripts: {
                    deploy: `${getPackageManager().command} install`,
                    build: `${getPackageManager().command} run build`,
                },
            });
            break component;
        }

        if (await isReactComponent(contents)) {
            addFrontendComponentToConfig(configPath, genezioConfig, {
                path: componentPath,
                publish: path.join(componentPath, "build"),
                scripts: {
                    deploy: `${getPackageManager().command} install`,
                    build: `${getPackageManager().command} run build`,
                },
            });
            break component;
        }
    }

    prettyLogGenezioConfig(genezioConfig);
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
    try {
        const fileContent = await fs.readFile(filePath, "utf-8");
        return fileContent;
    } catch (error) {
        log.error("Error reading package.json:", error);
        return "";
    }
}

// This is a nice-to-have feature that logs the detected configuration in a pretty way
function prettyLogGenezioConfig(config: RawYamlProjectConfiguration): void {
    const name = config.name ? `Application Name: ${config.name}` : "";
    const region = config.region ? `Region: ${config.region}` : "";

    const component = (
        initialDecription: string,
        componentName: string,
        componentConfig: SSRFrameworkComponent,
    ) => {
        const path = componentConfig.path
            ? `Path to ${componentName}: ${componentConfig.path}`
            : "";
        const packageManager = componentConfig.packageManager
            ? `Package manager used: ${componentConfig.packageManager}`
            : "";
        const deployScript = componentConfig.scripts?.deploy
            ? `Scripts run before building: ${componentConfig.scripts.deploy}`
            : "";
        const buildScript = componentConfig.scripts?.build
            ? `Scripts run to build the project: ${componentConfig.scripts.build}`
            : "";
        const startScript = componentConfig.scripts?.start
            ? `Scripts run to start a local environment: ${componentConfig.scripts.start}`
            : "";
        return [initialDecription, path, packageManager, deployScript, buildScript, startScript]
            .filter(Boolean)
            .join("\n  ");
    };

    const components = [
        config.nextjs
            ? component(
                  "We found a Next.js component in your project:",
                  "Next.js",
                  config.nextjs as SSRFrameworkComponent,
              )
            : "",
        config.nuxt
            ? component(
                  "We found a Nuxt component in your project:",
                  "Nuxt",
                  config.nuxt as SSRFrameworkComponent,
              )
            : "",
        config.nitro
            ? component(
                  "We found a Nitro component in your project:",
                  "Nitro",
                  config.nitro as SSRFrameworkComponent,
              )
            : "",
    ]
        .filter(Boolean)
        .join("\n\n");

    // TODO: Improve this message (VITE or CRA, multiple frontend frameworks)
    const frontend = config.frontend ? `We found a React component in your project` : ``;

    const result = [name, region, components, frontend].filter(Boolean).join("\n");

    log.info(result);
}
