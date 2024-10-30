import { ProjectConfiguration } from "../../models/projectConfiguration.js";
import cliProgress from "cli-progress";
import path from "path";
import { getPresignedURL } from "../../requests/getPresignedURL.js";
import { debugLogger } from "../../utils/logging.js";
import { uploadContentToS3 } from "../../requests/uploadContentToS3.js";
import { log } from "../../utils/logging.js";
import { deployRequest } from "../../requests/deployCode.js";
import {
    CloudAdapter,
    CloudAdapterOptions,
    GenezioCloudInput,
    GenezioCloudOutput,
} from "../cloudAdapter.js";
import {
    createTemporaryFolder,
    deleteFolder,
    zipDirectoryToDestinationPath,
} from "../../utils/file.js";
import { YamlFrontend } from "../../projectConfiguration/yaml/v2.js";
import { createFrontendProject } from "../../requests/createFrontendProject.js";
import { getFrontendPresignedURL } from "../../requests/getFrontendPresignedURL.js";
import { CloudProviderIdentifier } from "../../models/cloudProviderIdentifier.js";
import { UserError } from "../../errors.js";
import { stdout } from "process";
import { createHash } from "../../utils/strings.js";

export class GenezioCloudAdapter implements CloudAdapter {
    async deploy(
        input: GenezioCloudInput[],
        projectConfiguration: ProjectConfiguration,
        cloudAdapterOptions: CloudAdapterOptions,
        stack: string[] = [],
        sourceRepository?: string,
    ): Promise<GenezioCloudOutput> {
        const stage: string = cloudAdapterOptions.stage || "";

        log.info("Deploying your backend project to the genezio infrastructure...");
        const multibar = new cliProgress.MultiBar(
            {
                stream: stdout,
                clearOnComplete: false,
                hideCursor: true,
                format: "Uploading {filename}: {bar} | {value}% | {eta_formatted}",
            },
            cliProgress.Presets.shades_grey,
        );

        const promisesDeploy = input.map(async (element) => {
            // await handleBigElementSizeError(element, projectConfiguration, BUNDLE_SIZE_LIMIT);

            debugLogger.debug(
                `Get the presigned URL for ${element.type}: ${element.name} ${element.archiveName}.`,
            );
            const presignedUrl = await getPresignedURL(
                projectConfiguration.region,
                element.archiveName ?? "genezioDeploy.zip",
                projectConfiguration.name,
                element.name,
            );

            const bar = multibar.create(100, 0, { filename: element.name });
            debugLogger.debug(`Upload the content to S3 for ${element.type}: ${element.name}..`);
            await uploadContentToS3(presignedUrl, element.archivePath, (percentage) => {
                bar.update(parseFloat((percentage * 100).toFixed(2)), {
                    filename: element.name,
                });

                if (percentage == 1) {
                    bar.stop();
                }
            });

            debugLogger.debug(
                `Done uploading the content to S3 for ${element.type}: ${element.name}..`,
            );
        });

        // wait for all promises to finish
        await Promise.all(promisesDeploy);
        multibar.stop();
        // The loading spinner is removing lines and with this we avoid clearing a progress bar.
        // This can be removed only if we find a way to avoid clearing lines.
        log.info("");

        const response = await deployRequest(
            projectConfiguration,
            input,
            stage,
            stack,
            sourceRepository,
        );
        const classesInfo = response.classes.map((c) => ({
            className: c.name,
            methods: c.methods.map((m) => ({
                name: m.name,
                type: m.type,
                cronString: m.cronString,
                functionUrl: getFunctionUrl(c.cloudUrl, m.type, c.name, m.name),
            })),
            functionUrl: getClassFunctionUrl(
                c.cloudUrl,
                projectConfiguration.cloudProvider,
                c.name,
            ),
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
        const finalStageName =
            stage != "" && stage != "prod" ? `-${stage.replaceAll(/[/_.]/gm, "-")}` : "";
        let finalSubdomain = frontend.subdomain + finalStageName;
        if (finalSubdomain.length > 63) {
            debugLogger.debug("Subdomain is too long. Generating random subdomain.");
            finalSubdomain = frontend.subdomain?.substring(0, 55) + "-" + createHash(stage, 4);
        }
        const archivePath = path.join(await createTemporaryFolder(), `${finalSubdomain}.zip`);
        debugLogger.debug("Creating temporary folder", archivePath);

        const frontendPath = path.join(frontend.path, frontend.publish || ".");
        await zipDirectoryToDestinationPath(
            frontendPath,
            finalSubdomain,
            archivePath,
            /* includeHiddenFiles= */ true,
            /* exclusions= */ [".git", ".github"],
        );

        debugLogger.debug("Getting presigned URL...");
        const result = await getFrontendPresignedURL(finalSubdomain, projectName, stage);

        if (!result.presignedURL) {
            throw new UserError("An error occurred (missing presignedUrl). Please try again!");
        }

        if (!result.userId) {
            throw new UserError("An error occurred (missing userId). Please try again!");
        }

        debugLogger.debug("Content of the folder zipped. Uploading to S3.");
        await uploadContentToS3(result.presignedURL, archivePath, undefined, result.userId);
        debugLogger.debug("Uploaded to S3.");
        const finalDomain = await createFrontendProject(
            finalSubdomain,
            projectName,
            projectRegion,
            stage,
            [...(frontend.redirects || []), ...(frontend.rewrites || [])],
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

function getClassFunctionUrl(
    baseUrl: string,
    cloudProvider: CloudProviderIdentifier,
    className: string,
): string {
    if (
        cloudProvider === CloudProviderIdentifier.GENEZIO_UNIKERNEL ||
        cloudProvider === CloudProviderIdentifier.GENEZIO_CLOUD
    ) {
        return baseUrl;
    } else {
        return `${baseUrl}${className}`;
    }
}
