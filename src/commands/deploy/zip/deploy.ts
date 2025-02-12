import { GenezioDeployOptions } from "../../../models/commandOptions.js";
import ZipAdm from "adm-zip";
import { createTemporaryFolder } from "../../../utils/file.js";
import { getCloudAdapter } from "../genezio.js";
import { CloudProviderIdentifier } from "../../../models/cloudProviderIdentifier.js";
import { YamlConfigurationIOController } from "../../../projectConfiguration/yaml/v2.js";
import path from "path";
import { ProjectConfiguration } from "../../../models/projectConfiguration.js";
import { GenezioCloudInputType } from "../../../cloudAdapter/cloudAdapter.js";
import { reportSuccessFunctions } from "../../../utils/reporter.js";
import { log } from "../../../utils/logging.js";
import colors from "colors";
import { DASHBOARD_URL } from "../../../constants.js";

export async function zipDeploy(options: GenezioDeployOptions) {
    if (!options.zip) {
        throw new Error("The --zip option is required for the zip deploy command.");
    }
    const zipPath = options.zip;

    const zip = new ZipAdm(zipPath);
    const tmp = await createTemporaryFolder();
    // 1. Check if the zip file exists and it is valid
    const success = zip.extractEntryTo("genezio.yaml", tmp);
    if (!success) {
        throw new Error(
            "Could not read the genezio.yaml file from the zip file. Make sure the zip file is valid and contains the genezio.yaml file.",
        );
    }

    const configPath = path.join(tmp, "genezio.yaml");

    // Read genezio.yaml
    const configIOController = new YamlConfigurationIOController(configPath, {
        stage: options.stage,
    });
    const configuration = await configIOController.read();
    const projectConfiguration = new ProjectConfiguration(
        configuration,
        CloudProviderIdentifier.GENEZIO_CLOUD,
        {
            generatorResponses: [],
            classesInfo: [],
        },
    );

    if (!projectConfiguration.functions) {
        throw new Error("No functions found in the project configuration");
    }

    const cloudAdapterDeployInput = projectConfiguration.functions.map((f) => {
        return {
            type: GenezioCloudInputType.FUNCTION as GenezioCloudInputType.FUNCTION,
            name: f.name,
            archivePath: zipPath,
            unzippedBundleSize: 0,
            entryFile: f.entry,
            timeout: f.timeout,
            instanceSize: f.instanceSize,
            vcpuCount: f.vcpuCount,
            memoryMb: f.memoryMb,
            storageSize: f.storageSize,
            maxConcurrentRequestsPerInstance: f.maxConcurrentRequestsPerInstance,
            maxConcurrentInstances: f.maxConcurrentInstances,
            cooldownTime: f.cooldownTime,
            persistent: f.persistent,
        };
    });

    const cloudAdapter = getCloudAdapter(CloudProviderIdentifier.GENEZIO_CLOUD);
    const result = await cloudAdapter.deploy(
        cloudAdapterDeployInput,
        projectConfiguration,
        {
            stage: options.stage,
        },
        [],
    );
    if (result.functions.length > 0) {
        reportSuccessFunctions(result.functions);
    }

    const frontendUrls: string[] = [];
    if (configuration.frontend) {
        for (const frontend of configuration.frontend) {
            const frontendUrl = await cloudAdapter.deployFrontend(
                projectConfiguration.name,
                projectConfiguration.region,
                frontend,
                options.stage,
            );
            frontendUrls.push(frontendUrl);
        }

        for (const frontendUrl of frontendUrls) {
            log.info(colors.cyan(`Frontend URL: ${frontendUrl}`));
        }
    }

    log.info(
        `\nApp Dashboard URL: ${colors.cyan(`${DASHBOARD_URL}/project/${result.projectId}/${result.projectEnvId}`)}\n` +
            `${colors.dim("Here you can monitor logs, set up a custom domain, and more.")}\n`,
    );
}
