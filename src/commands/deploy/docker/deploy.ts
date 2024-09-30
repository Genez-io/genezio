import { $ } from "execa";
import { UserError } from "../../../errors.js";
import { debugLogger, log } from "../../../utils/logging.js";
import { readOrAskConfig } from "../utils.js";
import { GenezioDeployOptions } from "../../../models/commandOptions.js";
import {
    FunctionConfiguration,
    ProjectConfiguration,
} from "../../../models/projectConfiguration.js";
import { CloudProviderIdentifier } from "../../../models/cloudProviderIdentifier.js";
import { getCloudProvider } from "../../../requests/getCloudProvider.js";
import { getCloudAdapter } from "../genezio.js";
import { GenezioCloudInputType } from "../../../cloudAdapter/cloudAdapter.js";
import { setEnvironmentVariables } from "../../../requests/setEnvironmentVariables.js";
import { FunctionType } from "../../../projectConfiguration/yaml/models.js";
import { createTemporaryFolder } from "../../../utils/file.js";
import path from "path";
import { reportSuccessFunctions } from "../../../utils/reporter.js";

export async function dockerDeploy(options: GenezioDeployOptions) {
    const config = await readOrAskConfig(options.config);
    const projectConfiguration = new ProjectConfiguration(
        config,
        CloudProviderIdentifier.GENEZIO_CLOUD,
        {
            generatorResponses: [],
            classesInfo: [],
        },
    );

    log.info("Check docker version...");
    await $({ stdio: "inherit" })`docker --version`.catch((err) => {
        debugLogger.error(err);
        throw new UserError("Docker is not installed. Please install Docker and try again.");
    });

    log.info("Building image...");
    await $({
        stdio: "inherit",
    })`docker buildx build --platform=linux/amd64 -t ${config.name} .`.catch((err) => {
        debugLogger.error(err);
        throw new UserError("Failed to build Docker image.");
    });

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
    const cwd = inspectResult[0].Config.WorkingDir;
    const entrypoint = inspectResult[0].Config.Entrypoint;
    const exposedPorts = inspectResult[0].Config.ExposedPorts;
    let cmdEntryFile = "";
    const port = getPort(exposedPorts);

    if (entrypoint) {
        cmdEntryFile += entrypoint.join(" ");
    } else {
        cmdEntryFile += "/bin/sh -c";
    }

    if (cmd) {
        cmdEntryFile += cmd.join(" ");
    }

    projectConfiguration.functions.push(
        new FunctionConfiguration(
            /*name:*/ "docker-container",
            /*path:*/ "",
            /*handler:*/ "",
            /*language:*/ "container",
            /*entry*/ "",
            /*type:*/ FunctionType.aws,
        ),
    );

    const cloudProvider = await getCloudProvider(projectConfiguration.name);
    const cloudAdapter = getCloudAdapter(cloudProvider);
    const result = await cloudAdapter.deploy(
        [
            {
                type: GenezioCloudInputType.FUNCTION,
                name: "docker-container",
                archivePath,
                archiveName: `genezio-${config.name}.tar`,
                entryFile: cmdEntryFile,
                unzippedBundleSize: 100,
                metadata: {
                    cmd: cmdEntryFile,
                    cwd: cwd,
                    http_port: port,
                },
            },
        ],
        projectConfiguration,
        {
            stage: options.stage,
        },
        ["docker"],
    );

    const envVars = envs.map((env: string) => {
        const components = env.split("=");
        const key = components[0];
        const value = components.slice(1).join("=");
        return {
            name: key,
            value,
        };
    });

    await setEnvironmentVariables(result.projectId, result.projectEnvId, envVars);

    reportSuccessFunctions(result.functions);
}

function getPort(exposedPort: { [id: string]: string }): string {
    let port = "8080";

    if (Object.keys(exposedPort).length >= 2) {
        throw new UserError("Only one port can be exposed.");
    } else if (Object.keys(exposedPort).length === 1) {
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