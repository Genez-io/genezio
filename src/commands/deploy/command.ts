import { GenezioDeployOptions } from "../../models/commandOptions.js";
import { interruptLocalProcesses } from "../../utils/localInterrupt.js";
import { debugLogger } from "../../utils/logging.js";
import { genezioDeploy } from "./genezio.js";
import fs from "fs";
import { nextJsDeploy } from "./nextjs/deploy.js";
import path from "path";
import { nuxtNitroDeploy } from "./nuxt/deploy.js";
import { dockerDeploy } from "./docker/deploy.js";
import { PackageManagerType } from "../../packageManagers/packageManager.js";
import { YamlConfigurationIOController } from "../../projectConfiguration/yaml/v2.js";
import { nestJsDeploy } from "./nestjs/deploy.js";
import { zipDeploy } from "./zip/deploy.js";
import { remixDeploy } from "./remix/deploy.js";
export type SSRFrameworkComponent = {
    path: string;
    packageManager: PackageManagerType;
    scripts?: {
        deploy?: string | string[];
        build?: string | string[];
        start?: string | string[];
    };
    environment?: {
        [key: string]: string;
    };
    subdomain?: string;
};

export async function deployCommand(options: GenezioDeployOptions) {
    await interruptLocalProcesses();
    const deployableComponentsType = await decideDeployType(options);
    debugLogger.debug(
        `The following components will be build and deployed: ${deployableComponentsType.join(", ")}`,
    );

    // The deployment actions are not called concurrently to avoid race conditions
    for (const type of deployableComponentsType) {
        switch (type) {
            case DeployType.Classic:
                debugLogger.debug("Deploying classic genezio app");
                await genezioDeploy(options);
                break;
            case DeployType.NextJS:
                debugLogger.debug("Deploying Next.js app");
                await nextJsDeploy(options);
                break;
            case DeployType.Nuxt:
            case DeployType.Nitro:
                debugLogger.debug("Deploying Nuxt app");
                await nuxtNitroDeploy(options, type);
                break;
            case DeployType.Docker:
                debugLogger.debug("Deploying Docker app");
                await dockerDeploy(options);
                break;
            case DeployType.Nest:
                debugLogger.debug("Deploying Nest.js app");
                await nestJsDeploy(options);
                break;
            case DeployType.Zip:
                debugLogger.debug("Deploying zip file");
                await zipDeploy(options);
                break;
            case DeployType.Remix:
                debugLogger.debug("Deploying Remix app");
                await remixDeploy(options);
                break;
        }
    }
}

export enum DeployType {
    Classic = "classic",
    NextJS = "next",
    Nitro = "nitro",
    Nuxt = "nuxt",
    Docker = "docker",
    Nest = "nest",
    Zip = "zip",
    Remix = "remix",
}

/**
 * Determines the deployable components for a project.
 *
 * - If the `genezio.yaml` configuration specifies multiple components,
 *   the function will return a list of all deployable components.
 * - Otherwise, it will return the first deployable component
 *   found based on the dependencies and files present in the project.
 *
 * @returns A list of deployable components.
 */
async function decideDeployType(options: GenezioDeployOptions): Promise<DeployType[]> {
    const cwd = process.cwd();
    const deployableComponents: DeployType[] = [];

    if (options.zip) {
        return [DeployType.Zip];
    }

    if (options.image) {
        return [DeployType.Docker];
    }

    if (fs.existsSync(path.join(cwd, "genezio.yaml"))) {
        const configIOController = new YamlConfigurationIOController(options.config);
        const config = await configIOController.read();

        if (config.nitro) {
            deployableComponents.push(DeployType.Nitro);
        }
        if (config.nestjs) {
            deployableComponents.push(DeployType.Nest);
        }
        if (config.container) {
            deployableComponents.push(DeployType.Docker);
        }
        // For backend or frontend a classic genezio app should be added only once
        if (config.backend || config.frontend) {
            deployableComponents.push(DeployType.Classic);
        }
        if (config.nextjs) {
            deployableComponents.push(DeployType.NextJS);
        }
        if (config.nuxt) {
            deployableComponents.push(DeployType.Nuxt);
        }
        if (config.remix) {
            deployableComponents.push(DeployType.Remix);
        }

        // This ensures backwards compatibility for next/nuxt projects
        // that have a simple (only name and region) genezio.yaml
        if (deployableComponents.length > 0) {
            return deployableComponents;
        }
    }

    // Check if next.config.js exists
    if (
        fs.existsSync(path.join(cwd, "next.config.js")) ||
        fs.existsSync(path.join(cwd, "next.config.mjs")) ||
        fs.existsSync(path.join(cwd, "next.config.cjs")) ||
        fs.existsSync(path.join(cwd, "next.config.ts"))
    ) {
        return [DeployType.NextJS];
    }

    // Check if nuxt.config.js exists
    if (
        fs.existsSync(path.join(cwd, "nuxt.config.js")) ||
        fs.existsSync(path.join(cwd, "nuxt.config.mjs")) ||
        fs.existsSync(path.join(cwd, "nuxt.config.cjs")) ||
        fs.existsSync(path.join(cwd, "nuxt.config.ts"))
    ) {
        return [DeployType.Nuxt];
    }

    // Check if nitro.config.js exists
    if (
        fs.existsSync(path.join(cwd, "nitro.config.js")) ||
        fs.existsSync(path.join(cwd, "nitro.config.mjs")) ||
        fs.existsSync(path.join(cwd, "nitro.config.cjs")) ||
        fs.existsSync(path.join(cwd, "nitro.config.ts"))
    ) {
        return [DeployType.Nitro];
    }

    // Check if nest-cli.json exists
    if (fs.existsSync(path.join(cwd, "nest-cli.json"))) {
        return [DeployType.Nest];
    }

    // Check if package.json exists and has next/nuxt/nitro dependencies
    if (fs.existsSync(path.join(cwd, "package.json"))) {
        const packageJson = JSON.parse(fs.readFileSync(path.join(cwd, "package.json"), "utf-8"));
        if (packageJson.dependencies?.next) {
            return [DeployType.NextJS];
        }
        if (packageJson.dependencies?.nuxt || packageJson.devDependencies?.nuxt) {
            return [DeployType.Nuxt];
        }
        if (packageJson.dependencies?.nitropack || packageJson.devDependencies?.nitropack) {
            return [DeployType.Nitro];
        }
        if (
            packageJson.dependencies?.["@nestjs/core"] ||
            packageJson.devDependencies?.["@nestjs/core"]
        ) {
            return [DeployType.Nest];
        }
        if (
            Object.keys({ ...packageJson.dependencies, ...packageJson.devDependencies }).some(
                (dep) => dep.startsWith("@remix-run/"),
            )
        ) {
            return [DeployType.Remix];
        }
    }

    // Check if a Dockerfile exists in non-genezio project
    if (
        !fs.existsSync(path.join(cwd, "genezio.yaml")) &&
        fs.existsSync(path.join(cwd, "Dockerfile"))
    ) {
        return [DeployType.Docker];
    }

    // Default to classic genezio app
    return [DeployType.Classic];
}
