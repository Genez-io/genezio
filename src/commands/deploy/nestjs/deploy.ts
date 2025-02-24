import path from "path";
import git from "isomorphic-git";
import fs from "fs";
import colors from "colors";
import { $ } from "execa";
import { GenezioDeployOptions } from "../../../models/commandOptions.js";
import { log } from "../../../utils/logging.js";
import {
    actionDetectedEnvFile,
    attemptToInstallDependencies,
    prepareServicesPostBackendDeployment,
    prepareServicesPreBackendDeployment,
    readOrAskConfig,
    createBackendEnvVarList,
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
import { EnvironmentVariable } from "../../../models/environmentVariables.js";
import { warningMissingEnvironmentVariables } from "../../../utils/environmentVariables.js";
import { isCI } from "../../../utils/process.js";

export async function nestJsDeploy(options: GenezioDeployOptions) {
    const genezioConfig = await readOrAskConfig(options.config);
    const packageManagerType = genezioConfig.nestjs?.packageManager || NODE_DEFAULT_PACKAGE_MANAGER;

    const cwd = process.cwd();
    const componentPath = genezioConfig.nestjs?.path
        ? path.resolve(cwd, genezioConfig.nestjs.path)
        : cwd;

    // Give the user another chance if he forgot to add `--env` flag
    if (!isCI() && !options.env) {
        options.env = await actionDetectedEnvFile(componentPath, genezioConfig.name, options.stage);
    }

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
    await $({
        stdio: "inherit",
        cwd: componentPath,
    })`npx nest build`.catch(() => {
        throw new UserError("Failed to build the NestJS project. Check the logs above.");
    });

    const environmentVariables = await createBackendEnvVarList(
        options.env,
        options.stage,
        genezioConfig,
        SSRFrameworkComponentType.nestjs,
    );
    const result = await deployFunction(
        genezioConfig,
        options,
        componentPath,
        environmentVariables,
    );

    await uploadUserCode(genezioConfig.name, genezioConfig.region, options.stage, componentPath);

    const functionUrl = result.functions.find((f) => f.name === "function-nest")?.cloudUrl;

    await warningMissingEnvironmentVariables(
        genezioConfig.nestjs?.path || "./",
        result.projectId,
        result.projectEnvId,
    );

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
    environmentVariables?: EnvironmentVariable[],
) {
    const cloudProvider = await getCloudProvider(config.name);
    const cloudAdapter = getCloudAdapter(cloudProvider);
    const cwdRelative = path.relative(process.cwd(), cwd) || ".";

    const baseDir = path.normalize(path.resolve(process.cwd(), cwdRelative));
    const sourceModulesPath = path.join(baseDir, "node_modules");
    const targetModulesPath = path.join(baseDir, "dist", "node_modules");
    const functionPath = path.join(baseDir, "dist");
    await fs.promises.cp(sourceModulesPath, targetModulesPath, { recursive: true }).catch(() => {
        throw new UserError("Failed to copy node_modules to dist directory");
    });

    const serverFunction = {
        path: ".",
        name: "nest",
        entry: "main.js",
        type: config.nestjs?.type ? FunctionType.persistent : FunctionType.httpServer,
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

    const projectGitRepositoryUrl = (await git.listRemotes({ fs, dir: process.cwd() })).find(
        (r) => r.remote === "origin",
    )?.url;

    const result = await cloudAdapter.deploy(
        cloudInputs,
        projectConfiguration,
        { stage: options.stage },
        ["nestjs"],
        /* sourceRepository */ projectGitRepositoryUrl,
        /* environmentVariables */ environmentVariables,
    );

    return result;
}
