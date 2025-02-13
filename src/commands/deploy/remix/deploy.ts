import path from "path";
import git from "isomorphic-git";
import fs from "fs";
import colors from "colors";
import { $ } from "execa";
import { GenezioDeployOptions } from "../../../models/commandOptions.js";
import { debugLogger, log } from "../../../utils/logging.js";
import {
    actionDetectedEnvFile,
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
import { createTemporaryFolder } from "../../../utils/file.js";
import { DASHBOARD_URL } from "../../../constants.js";
import { EnvironmentVariable } from "../../../models/environmentVariables.js";
import { warningMissingEnvironmentVariables } from "../../../utils/environmentVariables.js";
import { isCI } from "../../../utils/process.js";

export async function remixDeploy(options: GenezioDeployOptions) {
    const genezioConfig = await readOrAskConfig(options.config);
    const packageManagerType = genezioConfig.remix?.packageManager || NODE_DEFAULT_PACKAGE_MANAGER;

    const cwd = process.cwd();
    const componentPath = genezioConfig.remix?.path
        ? path.resolve(cwd, genezioConfig.remix.path)
        : cwd;

   // Give the user another chance if he forgot to add `--env` flag
    if (!isCI() && !options.env) {
        options.env = await actionDetectedEnvFile(componentPath);
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

    // Check if the project uses remix vite by looking for vite.config.* files
    const isRemixVite =
        fs.existsSync(path.join(componentPath, "vite.config.ts")) ||
        fs.existsSync(path.join(componentPath, "vite.config.js")) ||
        fs.existsSync(path.join(componentPath, "vite.config.mjs")) ||
        fs.existsSync(path.join(componentPath, "vite.config.cjs"));

    if (isRemixVite) {
        debugLogger.debug("Building the project using: remix vite:build");
        // Build the project using remix vite
        await $({
            stdio: "inherit",
            cwd: componentPath,
        })`remix vite:build`.catch((error) => {
            throw new UserError(
                `Failed to build the Remix project. Check the logs above. ${error}`,
            );
        });
    } else {
        debugLogger.debug("Building the project using:remix build");
        // Build the project using remix build
        await $({
            stdio: "inherit",
            cwd: componentPath,
        })`remix build`.catch((error) => {
            throw new UserError(
                `Failed to build the Remix project. Check the logs above. ${error}`,
            );
        });
    }

    const remixBuildCommand = isRemixVite ? "remix vite:build" : "remix build";

    // Add remix component to config
    await addSSRComponentToConfig(
        options.config,
        {
            path: componentPath,
            packageManager: packageManagerType,
            scripts: {
                build: [remixBuildCommand],
                deploy: [`${installDependenciesCommand.command}`, remixBuildCommand],
            },
        },
        SSRFrameworkComponentType.remix,
    );

    // Copy the build folder to /tmp
    const tempBuildCwd = await createTemporaryFolder();
    debugLogger.debug(`Copying project files to ${tempBuildCwd}`);

    // Check and copy build folder
    const buildPath = path.join(componentPath, "build");
    await fs.promises
        .cp(buildPath, tempBuildCwd, { recursive: true, force: true, dereference: true })
        .catch((error) => {
            throw new UserError(
                `Failed to copy project build folder to temporary directory. ${error}`,
            );
        });

    if (!isRemixVite) {
        // Copy public folder
        const publicPath = path.join(componentPath, "public");
        await fs.promises
            .mkdir(path.join(tempBuildCwd, "public"), { recursive: true })
            .catch((error) => {
                throw new UserError(
                    `Failed to create public folder in temporary directory. ${error}`,
                );
            });
        await fs.promises
            .cp(publicPath, path.join(tempBuildCwd, "public"), {
                recursive: true,
                force: true,
                dereference: true,
            })
            .catch((error) => {
                throw new UserError(
                    `Failed to copy public folder to temporary directory. ${error}`,
                );
            });
    }

    // Check and copy file package.json
    const packageJsonPath = path.join(componentPath, "package.json");
    if (!fs.existsSync(packageJsonPath)) {
        throw new UserError("package.json not found in the project directory: " + packageJsonPath);
    }

    // Copy package.json to tempBuildCwd with proper destination path
    const destPackageJsonPath = path.join(tempBuildCwd, "package.json");
    await fs.promises
        .cp(packageJsonPath, destPackageJsonPath, {
            recursive: true,
            force: true,
            dereference: true,
        })
        .catch((error) => {
            throw new UserError(`Failed to copy package.json to temporary directory. ${error}`);
        });

    if (isRemixVite) {
        const serverIndexPath = path.join(tempBuildCwd, "server", "index.js");
        const serverIndexContent = await fs.promises.readFile(serverIndexPath, "utf-8");
        const packageJsonPathServer = path.join(tempBuildCwd, "server", "package.json");

        // Check if server/index.js use import syntax if use and dont have package.json with type: module create one
        const hasEsModules = /^[\s\n]*import\s+(?:[\w*\s{},]*\s+from\s+)?['"]/m.test(
            serverIndexContent,
        );
        if (hasEsModules && !fs.existsSync(packageJsonPathServer)) {
            await fs.promises.writeFile(
                packageJsonPathServer,
                JSON.stringify({ type: "module" }, null, 2),
            );
        }
    }

    // Install express and @remix-run/express
    await attemptToInstallDependencies(
        ["express", "@remix-run/express"],
        tempBuildCwd,
        packageManagerType,
    );

    const serverMjsPath = path.join(tempBuildCwd, "server.mjs");
    await fs.promises.writeFile(
        serverMjsPath,
        isRemixVite ? serverRemixViteContent : serverRemixClassicContent,
    );
    const environmentVariables = await uploadEnvVarsFromFile(
        options.env,
        options.stage,
        genezioConfig,
        SSRFrameworkComponentType.remix,
    );
    const result = await deployFunction(genezioConfig, options, tempBuildCwd, environmentVariables);

    await uploadUserCode(genezioConfig.name, genezioConfig.region, options.stage, componentPath);

    const functionUrl = result.functions.find((f) => f.name === "function-remix")?.cloudUrl;

    await warningMissingEnvironmentVariables(genezioConfig.remix?.path || "./", result.projectId, result.projectEnvId);

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

    const serverFunction = {
        path: ".",
        name: "remix",
        entry: "server.mjs",
        type: FunctionType.httpServer,
        timeout: config.remix?.timeout,
        storageSize: config.remix?.storageSize,
        instanceSize: config.remix?.instanceSize,
        vcpuCount: config.remix?.vcpuCount,
        memoryMb: config.remix?.memoryMb,
        maxConcurrentRequestsPerInstance: config.remix?.maxConcurrentRequestsPerInstance,
        maxConcurrentInstances: config.remix?.maxConcurrentInstances,
        cooldownTime: config.remix?.cooldownTime,
    };

    const deployConfig: YamlProjectConfiguration = {
        ...config,
        backend: {
            path: cwd,
            language: {
                name: Language.js,
                architecture: DEFAULT_ARCHITECTURE,
                packageManager: PackageManagerType.npm,
                ...(config.remix?.runtime !== undefined && { runtime: config.remix.runtime }),
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
        projectConfiguration.functions.map((f) => functionToCloudInput(f, cwd)),
    );
    const projectGitRepositoryUrl = (await git.listRemotes({ fs, dir: process.cwd() })).find(
        (r) => r.remote === "origin",
    )?.url;

    const result = await cloudAdapter.deploy(
        cloudInputs,
        projectConfiguration,
        { stage: options.stage },
        ["remix"],
        /* sourceRepository */ projectGitRepositoryUrl,
        /* environmentVariables */ environmentVariables,
    );

    return result;
}

const serverRemixViteContent = `
import express from "express";
import { createRequestHandler } from "@remix-run/express";
import * as build from "./server/index.js";

const app = express();

app.use(express.static("client"));

app.all("*", createRequestHandler({ build }));

app.listen(8080, () => {
  console.log("Server is running on http://localhost:8080");
});`;

const serverRemixClassicContent = `
import express from "express";
import { createRequestHandler } from "@remix-run/express";
import * as build from "./index.js";
const app = express();

app.use(express.static('public'));
app.all('*', createRequestHandler({ build }));

app.listen(8080, () => {
  console.log('Server running at http://localhost:8080');
});`;
