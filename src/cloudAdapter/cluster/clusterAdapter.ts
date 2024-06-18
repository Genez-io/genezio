import { ProjectConfiguration } from "../../models/projectConfiguration.js";
import { YamlFrontend } from "../../yamlProjectConfiguration/v2.js";
import {
    CloudAdapter,
    CloudAdapterOptions,
    GenezioCloudInput,
    GenezioCloudOutput,
} from "../cloudAdapter.js";
import { debugLogger, log } from "../../utils/logging.js";
import {
    getContainerRegistry,
    getContainerRegistryCredentials,
} from "../../requests/containerRegistry.js";
import { SpawnSyncReturns, spawnSync } from "child_process";
import { deployRequest } from "../../requests/deployCode.js";
import {
    createTemporaryFolder,
    deleteFolder,
    zipDirectoryToDestinationPath,
} from "../../utils/file.js";
import path from "path";
import { getFrontendPresignedURL } from "../../requests/getFrontendPresignedURL.js";
import { uploadContentToS3 } from "../../requests/uploadContentToS3.js";
import { createFrontendProject } from "../../requests/createFrontendProject.js";
import { UserError } from "../../errors.js";

export class ClusterCloudAdapter implements CloudAdapter {
    async deploy(
        input: GenezioCloudInput[],
        projectConfiguration: ProjectConfiguration,
        cloudAdapterOptions: CloudAdapterOptions,
    ): Promise<GenezioCloudOutput> {
        const stage: string = cloudAdapterOptions.stage || "";

        log.info("Deploying your backend project to genezio infrastructure...");

        // Login to container repository
        let dockerlogin: SpawnSyncReturns<Buffer> | null = null;
        const containerRegistryInfo = await getContainerRegistry();
        const containerRegistryCreds = await getContainerRegistryCredentials();
        const promisesDeploy = input.map(async (element) => {
            debugLogger.debug(`Get the registry push data for class name ${element.name}.`);

            if (dockerlogin === null) {
                spawnSync("docker", ["logout", containerRegistryInfo.repository]);

                dockerlogin = spawnSync("docker", [
                    "login",
                    "-u",
                    containerRegistryInfo.username,
                    "-p",
                    containerRegistryCreds.password,
                    containerRegistryInfo.repository,
                ]);

                if (dockerlogin.status !== 0) {
                    throw new UserError(
                        `Error during container repository login. Exit code: ${dockerlogin.status}`,
                    );
                }
            }

            debugLogger.debug(`Upload the content to Harbor registry for class ${element.name}.`);

            const timestamp = Date.now().toString();
            const tag =
                `${containerRegistryInfo.repository}/${containerRegistryInfo.username}/${projectConfiguration.name}/${element.name}:${timestamp}`.toLowerCase();

            projectConfiguration.classes.find((c) => c.name === element.name)!.options = {
                ...projectConfiguration.classes.find((c) => c.name === element.name)!.options,
                timestamp,
            };

            const dockerTag = spawnSync("docker", [
                "tag",
                `${projectConfiguration.name}-${element.name}`.toLowerCase(),
                tag,
            ]);
            if (dockerTag.status !== 0) {
                throw new UserError(
                    `Error during container image tag. Exit code: ${dockerTag.status}`,
                );
            }

            // push image
            debugLogger.debug(`Pushing the container image for ${element.name}...`);
            const dockerPush = spawnSync("docker", ["push", tag]);
            if (dockerPush.status !== 0) {
                throw new UserError(
                    `Error during container image push. Exit code: ${dockerPush.status}`,
                );
            }
            debugLogger.debug(`Done uploading the container image for ${element.name}.`);
        });

        await Promise.all(promisesDeploy);

        const response = await deployRequest(projectConfiguration, input, stage);
        const classesInfo = response.classes.map((c) => ({
            className: c.name,
            methods: c.methods.map((m) => ({
                name: m.name,
                type: m.type,
                cronString: m.cronString,
                functionUrl: getFunctionUrl(c.cloudUrl, m.type, c.name, m.name),
            })),
            functionUrl: c.cloudUrl,
            projectId: response.projectId,
        }));

        return {
            projectId: response.projectId,
            projectEnvId: response.projectEnvId,
            classes: classesInfo,
            functions: response.functions,
        };
    }

    async deployFrontend(
        projectName: string,
        projectRegion: string,
        frontend: YamlFrontend,
        stage: string,
    ): Promise<string> {
        const finalStageName = stage != "" && stage != "prod" ? `-${stage}` : "";
        const finalSubdomain = frontend.subdomain + finalStageName;
        const archivePath = path.join(await createTemporaryFolder(), `${finalSubdomain}.zip`);
        debugLogger.debug("Creating temporary folder", archivePath);

        await zipDirectoryToDestinationPath(frontend.path, finalSubdomain, archivePath);

        debugLogger.debug("Getting presigned URL...");
        const result = await getFrontendPresignedURL(finalSubdomain, projectName, stage);

        if (!result.presignedURL) {
            throw new Error("An error occurred (missing presignedUrl). Please try again!");
        }

        if (!result.userId) {
            throw new Error("An error occurred (missing userId). Please try again!");
        }

        debugLogger.debug("Content of the folder zipped. Uploading to S3.");
        await uploadContentToS3(result.presignedURL, archivePath, undefined, result.userId);
        debugLogger.debug("Uploaded to S3.");
        const finalDomain = await createFrontendProject(
            finalSubdomain,
            projectName,
            projectRegion,
            stage,
        );

        // clean up temporary folder
        await deleteFolder(path.dirname(archivePath));

        return finalDomain;
    }
}

function getFunctionUrl(
    baseUrl: string,
    methodType: string,
    className: string,
    methodName: string,
): string {
    if (methodType === "http") {
        // trim the last slash of baseUrl if it exists
        if (baseUrl.endsWith("/")) {
            baseUrl = baseUrl.slice(0, -1);
        }
        return `${baseUrl}/${className}/${methodName}`;
    } else {
        return `${baseUrl}/${className}`;
    }
}
