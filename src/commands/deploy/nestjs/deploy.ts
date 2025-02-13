import path from "path";
import fs from "fs";
import colors from "colors";
import { $ } from "execa";
import { GenezioDeployOptions } from "../../../models/commandOptions.js";
import { log } from "../../../utils/logging.js";
import {
    attemptToInstallDependencies,
    prepareServicesPostBackendDeployment,
    prepareServicesPreBackendDeployment,
    readOrAskConfig,
    uploadEnvVarsFromFile,
    uploadUserCode,
} from "../utils.js";
import { addSSRComponentToConfig } from "../../analyze/utils.js";
import {
    NODE_DEFAULT_PACKAGE_MANAGER,
    PackageManagerType,
} from "../../../packageManagers/packageManager.js";
import { DEFAULT_ARCHITECTURE, SSRFrameworkComponentType } from "../../../models/projectOptions.js";
import { UserError } from "../../../errors.js";
import { YamlProjectConfiguration } from "../../../projectConfiguration/yaml/v2.js";
import { getCloudProvider } from "../../../requests/getCloudProvider.js";
import { functionToCloudInput, getCloudAdapter } from "../genezio.js";
import { FunctionType, Language } from "../../../projectConfiguration/yaml/models.js";
import { ProjectConfiguration } from "../../../models/projectConfiguration.js";
import { DASHBOARD_URL } from "../../../constants.js";

export async function nestJsDeploy(options: GenezioDeployOptions) {
    const genezioConfig = await readOrAskConfig(options.config);
    const packageManagerType = genezioConfig.nestjs?.packageManager || NODE_DEFAULT_PACKAGE_MANAGER;

    const cwd = process.cwd();
    const componentPath = genezioConfig.nestjs?.path
        ? path.resolve(cwd, genezioConfig.nestjs.path)
        : cwd;

    // Prepare services before deploying (database, authentication, etc)
    await prepareServicesPreBackendDeployment(
        genezioConfig,
        genezioConfig.name,
        options.stage,
        options.env,
    );

    // Install dependencies
    const installDependenciesCommand = await attemptToInstallDependencies(
        [],
        componentPath,
        packageManagerType,
    );

    // Add nestjs component to config
    await addSSRComponentToConfig(
        options.config,
        {
            path: componentPath,
            packageManager: packageManagerType,
            scripts: {
                deploy: [`${installDependenciesCommand.command}`],
            },
        },
        SSRFrameworkComponentType.nestjs,
    );

    // Build NestJS project
    const nxConfigPath = path.join(componentPath, "nx.json");
    const isNxProject = fs.existsSync(nxConfigPath);

    const nxEnvName = process.env["NX_ENV_NAME"] || "server";

    if (isNxProject && !process.env["NX_ENV_NAME"]) {
        log.warn("NX_ENV_NAME environment variable is not set. Using default value 'server'.");
    }

    if (isNxProject) {
        await $({
            stdio: "inherit",
            cwd: componentPath,
        })`npx nx build ${nxEnvName}`.catch(() => {
            throw new UserError(
                "Failed to build the NestJS project with NX. Check the logs above.",
            );
        });
    } else {
        await $({
            stdio: "inherit",
            cwd: componentPath,
        })`npx nest build`.catch(() => {
            throw new UserError("Failed to build the NestJS project. Check the logs above.");
        });
    }

    const result = await deployFunction(genezioConfig, options, componentPath, nxEnvName);

    await uploadEnvVarsFromFile(
        options.env,
        result.projectId,
        result.projectEnvId,
        componentPath,
        options.stage || "prod",
        genezioConfig,
        SSRFrameworkComponentType.nestjs,
    );

    await uploadUserCode(genezioConfig.name, genezioConfig.region, options.stage, componentPath);

    const functionUrl = result.functions.find((f) => f.name === "function-nest")?.cloudUrl;

    await prepareServicesPostBackendDeployment(genezioConfig, genezioConfig.name, options.stage);

    if (functionUrl) {
        log.info(
            `The app is being deployed at ${colors.cyan(functionUrl)}. It might take a few moments to be available worldwide.`,
        );

        log.info(
            `\nApp Dashboard URL: ${colors.cyan(`${DASHBOARD_URL}/project/${result.projectId}/${result.projectEnvId}`)}\n` +
                `${colors.dim("Here you can monitor logs, set up a custom domain, and more.")}\n`,
        );
    } else {
        log.warn("No deployment URL was returned.");
    }
}

async function deployFunction(
    config: YamlProjectConfiguration,
    options: GenezioDeployOptions,
    cwd: string,
    nxEnvName: string,
) {
    const cloudProvider = await getCloudProvider(config.name);
    const cloudAdapter = getCloudAdapter(cloudProvider);
    const cwdRelative = path.relative(process.cwd(), cwd) || ".";

    const baseDir = path.normalize(path.resolve(process.cwd(), cwdRelative));
    const sourceModulesPath = path.join(baseDir, "node_modules");
    const isNxProject = fs.existsSync(path.join(cwd, "nx.json"));
    const targetBasePath = isNxProject
        ? path.join(baseDir, "dist", "apps", nxEnvName)
        : path.join(baseDir, "dist");
    const targetModulesPath = path.join(targetBasePath, "node_modules");
    const functionPath = targetBasePath;

    await fs.promises.cp(sourceModulesPath, targetModulesPath, { recursive: true }).catch(() => {
        throw new UserError("Failed to copy node_modules to dist directory");
    });

    const serverFunction = {
        path: ".",
        name: "nest",
        entry: "main.js",
        type: FunctionType.httpServer,
        timeout: config.nestjs?.timeout,
        storageSize: config.nestjs?.storageSize,
        instanceSize: config.nestjs?.instanceSize,
        vcpuCount: config.nestjs?.vcpuCount,
        memoryMb: config.nestjs?.memoryMb,
        maxConcurrentRequestsPerInstance: config.nestjs?.maxConcurrentRequestsPerInstance,
        maxConcurrentInstances: config.nestjs?.maxConcurrentInstances,
        cooldownTime: config.nestjs?.cooldownTime,
    };

    const deployConfig: YamlProjectConfiguration = {
        ...config,
        backend: {
            path: cwdRelative,
            language: {
                name: Language.js,
                architecture: DEFAULT_ARCHITECTURE,
                packageManager: PackageManagerType.npm,
                ...(config.nestjs?.runtime !== undefined && { runtime: config.nestjs.runtime }),
            },
            functions: [serverFunction],
        },
    };

    const projectConfiguration = new ProjectConfiguration(
        deployConfig,
        await getCloudProvider(deployConfig.name),
        {
            generatorResponses: [],
            classesInfo: [],
        },
    );

    const cloudInputs = await Promise.all(
        projectConfiguration.functions.map((f) => functionToCloudInput(f, functionPath)),
    );

    const result = await cloudAdapter.deploy(
        cloudInputs,
        projectConfiguration,
        { stage: options.stage },
        ["nestjs"],
    );

    return result;
}
