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

export type SSRFrameworkComponent = {
    path: string;
    packageManager: PackageManagerType;
    scripts?: {
        deploy: string | string[];
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
    const type = await decideDeployType(options);

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
    }
}

export enum DeployType {
    Classic,
    NextJS,
    Nitro,
    Nuxt,
    Docker,
    Nest,
}

async function decideDeployType(options: GenezioDeployOptions): Promise<DeployType> {
    const cwd = process.cwd();

    if (options.image) {
        return DeployType.Docker;
    }

    // Check if it's a genezio-containerized project
    if (fs.existsSync(path.join(cwd, "genezio.yaml"))) {
        const configIOController = new YamlConfigurationIOController(options.config);
        const config = await configIOController.read();

        if (config.container) {
            return DeployType.Docker;
        }
        if (config.nextjs) {
            return DeployType.NextJS;
        }
        if (config.nuxt) {
            return DeployType.Nuxt;
        }
        if (config.nitro) {
            return DeployType.Nitro;
        }
        if (config.nestjs) {
            return DeployType.Nest;
        }
    }

    // Check if next.config.js exists
    if (
        fs.existsSync(path.join(cwd, "next.config.js")) ||
        fs.existsSync(path.join(cwd, "next.config.mjs")) ||
        fs.existsSync(path.join(cwd, "next.config.cjs")) ||
        fs.existsSync(path.join(cwd, "next.config.ts"))
    ) {
        return DeployType.NextJS;
    }

    // Check if nuxt.config.js exists
    if (
        fs.existsSync(path.join(cwd, "nuxt.config.js")) ||
        fs.existsSync(path.join(cwd, "nuxt.config.mjs")) ||
        fs.existsSync(path.join(cwd, "nuxt.config.cjs")) ||
        fs.existsSync(path.join(cwd, "nuxt.config.ts"))
    ) {
        return DeployType.Nuxt;
    }

    // Check if nitro.config.js exists
    if (
        fs.existsSync(path.join(cwd, "nitro.config.js")) ||
        fs.existsSync(path.join(cwd, "nitro.config.mjs")) ||
        fs.existsSync(path.join(cwd, "nitro.config.cjs")) ||
        fs.existsSync(path.join(cwd, "nitro.config.ts"))
    ) {
        return DeployType.Nitro;
    }

    // Check if nest-cli.json exists
    if (fs.existsSync(path.join(cwd, "nest-cli.json"))) {
        return DeployType.Nest;
    }

    // Check if "next" package is present in the project dependencies
    if (fs.existsSync(path.join(cwd, "package.json"))) {
        const packageJson = JSON.parse(fs.readFileSync(path.join(cwd, "package.json"), "utf-8"));
        if (packageJson.dependencies?.next) {
            return DeployType.NextJS;
        }
        if (packageJson.dependencies?.nuxt || packageJson.devDependencies?.nuxt) {
            return DeployType.Nuxt;
        }
        if (packageJson.dependencies?.nitropack || packageJson.devDependencies?.nitropack) {
            return DeployType.Nitro;
        }
        if (
            packageJson.dependencies?.["@nestjs/core"] ||
            packageJson.devDependencies?.["@nestjs/core"]
        ) {
            return DeployType.Nest;
        }
    }

    // Check if a Dockerfile exists in non-genezio project
    if (
        !fs.existsSync(path.join(cwd, "genezio.yaml")) &&
        fs.existsSync(path.join(cwd, "Dockerfile"))
    ) {
        return DeployType.Docker;
    }

    return DeployType.Classic;
}
