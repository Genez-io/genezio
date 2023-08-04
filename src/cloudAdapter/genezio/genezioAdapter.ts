import { ProjectConfiguration } from "../../models/projectConfiguration.js";
import cliProgress from 'cli-progress';
import path from "path";
import { getPresignedURL } from "../../requests/getPresignedURL.js";
import { debugLogger } from "../../utils/logging.js";
import { uploadContentToS3 } from "../../requests/uploadContentToS3.js";
import log from "loglevel";
import { deployRequest } from "../../requests/deployCode.js";
import { CloudAdapter, CloudAdapterOptions, GenezioCloudInput, GenezioCloudOutput } from "../cloudAdapter.js";
import { createTemporaryFolder, deleteFolder, zipDirectoryToDestinationPath } from "../../utils/file.js";
import { YamlFrontend } from "../../models/yamlProjectConfiguration.js";
import { createFrontendProject } from "../../requests/createFrontendProject.js";
import { getFrontendPresignedURL } from "../../requests/getFrontendPresignedURL.js";
import { FRONTEND_DOMAIN } from "../../constants.js";
import { getFileSize } from "../../utils/file.js";
import { CloudProviderIdentifier } from "../../models/cloudProviderIdentifier.js";

export const BUNDLE_SIZE_LIMIT = 262144000;

export class GenezioCloudAdapter implements CloudAdapter {
    async deploy(input: GenezioCloudInput[], projectConfiguration: ProjectConfiguration, cloudAdapterOptions: CloudAdapterOptions): Promise<GenezioCloudOutput> {
        const stage: string = cloudAdapterOptions.stage || "";

        log.info("Deploying your backend project to genezio infrastructure...");
        const multibar = new cliProgress.MultiBar({
            clearOnComplete: false,
            hideCursor: true,
            format: 'Uploading {filename}: {bar} | {value}% | {eta_formatted}',
        }, cliProgress.Presets.shades_grey);

        const promisesDeploy = input.map(async (element) => {
            debugLogger.debug(
                `Get the presigned URL for class name ${element.name}.`
            );
            const resultPresignedUrl = await getPresignedURL(
                projectConfiguration.region,
                "genezioDeploy.zip",
                projectConfiguration.name,
                element.name
            )

            const size = await getFileSize(element.archivePath);
            if (size > BUNDLE_SIZE_LIMIT) {
                throw new Error(`Your class ${element.name} is too big: ${size} bytes. The maximum size is 250MB. Try to reduce the size of your class.`);
            }

            const bar = multibar.create(100, 0, { filename: element.name });
            debugLogger.debug(`Upload the content to S3 for file ${element.filePath}.`)
            await uploadContentToS3(resultPresignedUrl.presignedURL, element.archivePath, (percentage) => {
                bar.update(parseFloat((percentage * 100).toFixed(2)), { filename: element.name });

                if (percentage == 1) {
                    bar.stop();
                }
            })

            debugLogger.debug(`Done uploading the content to S3 for file ${element.filePath}.`)
        }
        );

        // wait for all promises to finish
        await Promise.all(promisesDeploy);
        multibar.stop()
        // The loading spinner is removing lines and with this we avoid clearing a progress bar.
        // This can be removed only if we find a way to avoid clearing lines.
        log.info("")

        const response = await deployRequest(projectConfiguration, stage)

        const classesInfo = response.classes.map((c) => ({
            className: c.name,
            methods: c.methods.map((m) => ({
                name: m.name,
                type: m.type,
                cronString: m.cronString,
                functionUrl: getFunctionUrl(c.cloudUrl, m.type, c.name, m.name),
            })),
            functionUrl: getClassFunctionUrl(c.cloudUrl, projectConfiguration.cloudProvider, c.name),
            projectId: response.projectId
        }));

        return {
            classes: classesInfo,
        };
    }

    async deployFrontend(projectName: string, projectRegion: string, frontend: YamlFrontend, stage: string): Promise<string> {
        const finalStageName = stage != "" && stage != "prod" ? `-${stage}` : "";
        const finalSubdomain = frontend.subdomain + finalStageName;
        const archivePath = path.join(
            await createTemporaryFolder(),
            `${finalSubdomain}.zip`
        );
        debugLogger.debug("Creating temporary folder", archivePath);

        await zipDirectoryToDestinationPath(
            frontend.path,
            finalSubdomain,
            archivePath
        );

        debugLogger.debug("Getting presigned URL...");
        const result = await getFrontendPresignedURL(
            finalSubdomain,
            projectName,
            stage
        );

        if (!result.presignedURL) {
            throw new Error(
                "An error occured (missing presignedUrl). Please try again!"
            );
        }

        if (!result.userId) {
            throw new Error("An error occured (missing userId). Please try again!");
        }

        debugLogger.debug("Content of the folder zipped. Uploading to S3.");
        await uploadContentToS3(
            result.presignedURL,
            archivePath,
            undefined,
            result.userId
        );
        debugLogger.debug("Uploaded to S3.");
        await createFrontendProject(finalSubdomain, projectName, projectRegion, stage)

        // clean up temporary folder
        await deleteFolder(path.dirname(archivePath));

        if (stage != "" && stage != "prod") {
            return `https://${finalSubdomain}.${FRONTEND_DOMAIN}`
        }

        return `https://${finalSubdomain}.${FRONTEND_DOMAIN}`
    }
}

function getFunctionUrl(baseUrl: string, methodType: string, className: string, methodName: string): string {
    if (methodType === "http") {
        return `${baseUrl}/${className}/${methodName}`;
    } else {
        return `${baseUrl}/${className}`;
    }
}

function getClassFunctionUrl(baseUrl: string, cloudProvider: CloudProviderIdentifier, className: string): string {
    if (cloudProvider === CloudProviderIdentifier.CAPYBARA) {
        return baseUrl;
    } else {
        return `${baseUrl}${className}`;
    }
}
