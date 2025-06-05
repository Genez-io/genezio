import { $ } from "execa";
import git from "isomorphic-git";
import fs from "fs";
import { UserError } from "../../../errors.js";
import { debugLogger, log } from "../../../utils/logging.js";
import {
    actionDetectedEnvFile,
    prepareServicesPostBackendDeployment,
    prepareServicesPreBackendDeployment,
    readOrAskConfig,
    createBackendEnvVarList,
} from "../utils.js";
import { GenezioDeployOptions } from "../../../models/commandOptions.js";
import {
    FunctionConfiguration,
    ProjectConfiguration,
} from "../../../models/projectConfiguration.js";
import { CloudProviderIdentifier } from "../../../models/cloudProviderIdentifier.js";
import { getCloudProvider } from "../../../requests/getCloudProvider.js";
import { getCloudAdapter } from "../genezio.js";
import {
    GenezioCloudInputType,
    GenezioFunctionMetadata,
    GenezioFunctionMetadataType,
} from "../../../cloudAdapter/cloudAdapter.js";
import { FunctionType } from "../../../projectConfiguration/yaml/models.js";
import { createTemporaryFolder } from "../../../utils/file.js";
import path from "path";
import { reportSuccessFunctions } from "../../../utils/reporter.js";
import { addContainerComponentToConfig } from "./utils.js";
import { statSync } from "fs";
import colors from "colors";
import { DASHBOARD_URL } from "../../../constants.js";
import { EnvironmentVariable } from "../../../models/environmentVariables.js";
import { ContainerComponentType } from "../../../models/projectOptions.js";
import { warningMissingEnvironmentVariables } from "../../../utils/environmentVariables.js";
import { isCI } from "../../../utils/process.js";

export async function dockerDeploy(options: GenezioDeployOptions) {
    const config = await readOrAskConfig(options.config);

    if (!config.container) {
        const relativePath = path.relative(process.cwd(), options.image || process.cwd()) || ".";

        await addContainerComponentToConfig(options.config, config, {
            path: relativePath,
        });
    }

    // Give the user another chance if he forgot to add `--env` flag
    if (!isCI() && !options.env) {
        options.env = await actionDetectedEnvFile(
            config.container?.path || ".",
            config.name,
            options.stage,
        );
    }

    // Prepare services before deploying (database, authentication, etc)
    await prepareServicesPreBackendDeployment(config, config.name, options.stage, options.env);

    const projectConfiguration = new ProjectConfiguration(
        config,
        CloudProviderIdentifier.GENEZIO_CLOUD,
        {
            generatorResponses: [],
            classesInfo: [],
        },
    );

    const containerPath = config.container?.path || process.cwd();
    let dockerfile = "Dockerfile";
    let cwd = ".";
    if (statSync(containerPath).isDirectory()) {
        cwd = containerPath;
    } else {
        dockerfile = path.basename(containerPath);
        cwd = path.dirname(containerPath);
    }

    log.info("Check docker version...");
    await $({ stdio: "inherit" })`docker --version`.catch((err) => {
        debugLogger.error(err);
        throw new UserError("Docker is not installed. Please install Docker and try again.");
    });

    log.info("Building image...");
    await $({
        stdin: "inherit",
        stderr: "inherit",
        cwd,
    })`docker buildx build --platform=linux/amd64 -t ${config.name} -f ${dockerfile} .`.catch(
        (err) => {
            debugLogger.error(err);
            throw new UserError(`Failed to build Docker image. Error: ${err}`);
        },
    );

    log.info("Creating the container...");
    const { stdout } = await $`docker create --name genezio-${config.name} ${config.name}`.catch(
        (err) => {
            debugLogger.error(err);
            throw new UserError("Failed to create the container.");
        },
    );
    const containerId = await extractContainerId(stdout);
    const tempFolder = await createTemporaryFolder();
    const archivePath = path.join(tempFolder, `genezio-${config.name}.tar`);

    log.info("Exporting the container...");
    await $({
        stdio: "inherit",
        shell: true,
        cwd,
    })`docker export genezio-${config.name} > ${archivePath}`.catch((err) => {
        debugLogger.error(err);
        throw new UserError("Failed to export the container.");
    });

    const { stdout: stdoutInspect } = await $`docker inspect ${containerId}`.catch((err) => {
        debugLogger.error(err);
        throw new UserError("Failed to inspect the container.");
    });

    await $({ stdio: "inherit" })`docker container rm genezio-${config.name}`.catch((err) => {
        debugLogger.error(err);
        throw new UserError("Failed to remove the container.");
    });

    const inspectResult = JSON.parse(stdoutInspect);
    const envs = inspectResult[0].Config.Env;
    const cmd = inspectResult[0].Config.Cmd;
    const dockerWorkingDir = inspectResult[0].Config.WorkingDir;
    const entrypoint = inspectResult[0].Config.Entrypoint;
    const exposedPorts = inspectResult[0].Config.ExposedPorts;
    let cmdEntryFile = "";
    const port = getPort(exposedPorts);

    if (entrypoint) {
        cmdEntryFile += entrypoint.join(" ") + " ";
    } else {
        cmdEntryFile += "/bin/sh -c ";
    }

    if (cmd) {
        // Always quote the command when using /bin/sh -c to ensure proper argument handling
        cmdEntryFile += `'${cmd.join(" ")}'`;
    }

    projectConfiguration.functions.push(
        new FunctionConfiguration(
            /*name:*/ "docker-container",
            /*path:*/ "",
            /*handler:*/ "",
            /*language:*/ "container",
            /*entry*/ "",
            /*type:*/ FunctionType.aws,
            /*timeout:*/ undefined,
            /*storageSize:*/ undefined,
            /*instanceSize:*/ undefined,
            /*vcpuCount:*/ undefined,
            /*memoryMb:*/ undefined,
            /*maxConcurrentRequestsPerInstance:*/ undefined,
            /*maxConcurrentInstances:*/ undefined,
            /*cooldownTime:*/ undefined,
            /*persistent:*/ undefined,
            /*healthcheckPath:*/ config.container?.healthcheckPath,
        ),
    );

    const environmentVariables = await createBackendEnvVarList(
        options.env,
        options.stage,
        config,
        ContainerComponentType.container,
    );

    const envVars: EnvironmentVariable[] = envs.map((env: string) => {
        const components = env.split("=");
        const key = components[0];
        const value = components.slice(1).join("=");
        return {
            name: key,
            value,
        };
    });
    environmentVariables.push(...envVars);

    const projectGitRepositoryUrl = (await git.listRemotes({ fs, dir: process.cwd() })).find(
        (r) => r.remote === "origin",
    )?.url;

    const cloudProvider = await getCloudProvider(projectConfiguration.name);
    const cloudAdapter = getCloudAdapter(cloudProvider);
    const metadata: GenezioFunctionMetadata = {
        type: GenezioFunctionMetadataType.Container,
        cmd: cmdEntryFile,
        cwd: dockerWorkingDir,
        http_port: port,
        healthcheck_path: config.container?.healthcheckPath,
    };
    const result = await cloudAdapter.deploy(
        [
            {
                type: GenezioCloudInputType.FUNCTION,
                name: "docker-container",
                archivePath,
                archiveName: `genezio-${config.name}.tar`,
                entryFile: cmdEntryFile,
                unzippedBundleSize: 100,
                metadata: metadata,
                timeout: config.container!.timeout,
                storageSize: config.container!.storageSize,
                instanceSize: config.container!.instanceSize,
                vcpuCount: config.container!.vcpuCount,
                memoryMb: config.container!.memoryMb,
                maxConcurrentRequestsPerInstance:
                    config.container!.maxConcurrentRequestsPerInstance,
                maxConcurrentInstances: config.container!.maxConcurrentInstances,
                cooldownTime: config.container!.cooldownTime,
                persistent: config.container?.type === FunctionType.persistent,
            },
        ],
        projectConfiguration,
        {
            stage: options.stage,
        },
        ["docker"],
        /* sourceRepository */ projectGitRepositoryUrl,
        /* environmentVariables */ environmentVariables,
    );

    await warningMissingEnvironmentVariables(
        config.container?.path || "./",
        result.projectId,
        result.projectEnvId,
    );

    // Prepare services after deploying (authentication redirect urls)
    await prepareServicesPostBackendDeployment(config, config.name, options.stage);

    reportSuccessFunctions(result.functions);

    log.info(
        `\nApp Dashboard URL: ${colors.cyan(`${DASHBOARD_URL}/project/${result.projectId}/${result.projectEnvId}`)}\n` +
            `${colors.dim("Here you can monitor logs, set up a custom domain, and more.")}\n`,
    );
}

function getPort(exposedPort: { [id: string]: string }): string {
    let port = "8080";

    if (exposedPort && Object.keys(exposedPort).length >= 2) {
        throw new UserError("Only one port can be exposed.");
    } else if (exposedPort && Object.keys(exposedPort).length === 1) {
        port = Object.keys(exposedPort)[0].split("/")[0];
        const protocol = Object.keys(exposedPort)[0].split("/")[1];
        if (protocol !== "tcp") {
            throw new UserError("Only TCP protocol is supported.");
        }
    }

    return port;
}

async function extractContainerId(stdout: string): Promise<string> {
    // Use a regular expression to match a 64-character hexadecimal string
    const containerIdMatch = stdout.match(/[a-f0-9]{64}/i);

    // If a match is found, return the first match (container ID)
    if (containerIdMatch) {
        return containerIdMatch[0];
    } else {
        throw new Error("Container ID not found in the output.");
    }
}
