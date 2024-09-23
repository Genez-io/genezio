import { $ } from "execa";
import { UserError } from "../../../errors.js";
import { debugLogger, log } from "../../../utils/logging.js";
import { deployRequest } from "../../../requests/deployCode.js";
import { readOrAskConfig } from "../utils.js";
import { GenezioDeployOptions } from "../../../models/commandOptions.js";
import { ProjectConfiguration } from "../../../models/projectConfiguration.js";
import { CloudProviderIdentifier } from "../../../models/cloudProviderIdentifier.js";
import { getCloudProvider } from "../../../requests/getCloudProvider.js";
import { getCloudAdapter } from "../genezio.js";
import { GenezioCloudInputType } from "../../../cloudAdapter/cloudAdapter.js";

export async function dockerDeploy(options: GenezioDeployOptions) {
    const config = await readOrAskConfig(options.config);
    const projectConfiguration = new ProjectConfiguration(config, CloudProviderIdentifier.GENEZIO_CLOUD, {
        generatorResponses: [],
        classesInfo: [],
    });

    log.info("Check docker version...");
    await $({stdio: "inherit"})`docker --version`.catch((err) => {
        debugLogger.error(err);
        throw new UserError("Docker is not installed. Please install Docker and try again.");
    });

    log.info("Building image...");
    await $({stdio: "inherit"})`docker buildx build --platform=linux/amd64 -t ${config.name} .`.catch((err) => {
        debugLogger.error(err);
        throw new UserError("Failed to build Docker image.");
    });

    log.info("Creating the container...");
    const {stdout} = await $`docker create --name genezio-${config.name} ${config.name}`.catch((err) => {
        debugLogger.error(err);
        throw new UserError("Failed to create the container.");
    });
    log.info(stdout);
    const containerId = await extractContainerId(stdout);

    log.info("Exporting the container...");
    await $({stdio: "inherit", shell: true})`docker export genezio-${config.name} > genezio-${config.name}.tar`.catch((err) => {
        debugLogger.error(err);
        throw new UserError("Failed to export the container.");
    });

    const { stdout: stdoutInspect } = await $`docker inspect ${containerId}`.catch((err) => {
        debugLogger.error(err);
        throw new UserError("Failed to inspect the container.");
    });

    await $({stdio: "inherit"})`docker container rm genezio-${config.name}`.catch((err) => {
        debugLogger.error(err);
        throw new UserError("Failed to remove the container.");
    });

    const inspectResult = JSON.parse(stdoutInspect);
    const envs = inspectResult[0].Config.Env;
    const cmd = inspectResult[0].Config.Cmd;
    const cwd = inspectResult[0].Config.WorkingDir;
    const entrypoint = inspectResult[0].Config.Entrypoint;
    let cmdEntryFile = "";

    console.log(envs, cmd, cwd, entrypoint);

    if (cwd) {
        cmdEntryFile = "cd " + cwd + " && ";
    }

    if (entrypoint) {
        cmdEntryFile += entrypoint.join(" ");
    }

    if (cmd) {
        cmdEntryFile += cmd.join(" ");
    }

    console.log({cmdEntryFile});

    projectConfiguration.functions.push({
        name: "docker-container",
        language: "container",
    } as any);

    const cloudProvider = await getCloudProvider(projectConfiguration.name);
    const cloudAdapter = getCloudAdapter(cloudProvider);
    const result = await cloudAdapter.deploy(
        [{
            type: GenezioCloudInputType.FUNCTION,
            name: "docker-container",
            archivePath: `genezio-${config.name}.tar`, 
            archiveName: `genezio-${config.name}.tar`,
            entryFile: cmdEntryFile,
            unzippedBundleSize: 100,
        }],
        projectConfiguration,
        {
            stage: options.stage,
        },
        ["docker"],
    );
    console.log(result);
}

async function extractContainerId(stdout: string): Promise<string> {
    // Use a regular expression to match a 64-character hexadecimal string
    const containerIdMatch = stdout.match(/[a-f0-9]{64}/i);

    // If a match is found, return the first match (container ID)
    if (containerIdMatch) {
        return containerIdMatch[0];
    } else {
        throw new Error('Container ID not found in the output.');
    }
}

