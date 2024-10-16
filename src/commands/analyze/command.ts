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
import { addComponentToConfig, readOrAskConfig } from "../deploy/utils.js";
import { getPackageManager, PackageManagerType } from "../../packageManagers/packageManager.js";
import { SSRFrameworkComponentType } from "../../models/projectOptions.js";
import {
    RawYamlProjectConfiguration,
    YamlConfigurationIOController,
} from "../../projectConfiguration/yaml/v2.js";
import { UserError } from "../../errors.js";

export async function analyzeCommand(options: GenezioAnalyzeOptions) {
    const configPath = options.config;
    const cwd = process.cwd();
    const configIOController = new YamlConfigurationIOController(configPath);
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

        debugLogger.debug(`package.json found`);

        if (await isNextjsComponent(file)) {
            await addComponentToConfig(
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

        if (await isNuxtComponent(file)) {
            await addComponentToConfig(
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

        if (await isNitroComponent(file)) {
            await addComponentToConfig(
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

        if (await isViteComponent(file)) {
            genezioConfig.frontend = {
                path: componentPath,
                publish: path.join(componentPath, "dist"),
                scripts: {
                    deploy: `${getPackageManager().command} install`,
                    build: `${getPackageManager().command} run build`,
                },
            };
            break component;
        }

        if (await isReactComponent(file)) {
            genezioConfig.frontend = {
                path: componentPath,
                publish: path.join(componentPath, "build"),
                scripts: {
                    deploy: `${getPackageManager().command} install`,
                    build: `${getPackageManager().command} run build`,
                },
            };
            break component;
        }
    }

    log.info("Analyzed the current directory");
    await configIOController.write(genezioConfig);
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
