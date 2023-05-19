import { ProjectConfiguration } from "../../models/projectConfiguration";
import cliProgress from 'cli-progress';
import path from "path";
import { getPresignedURL } from "../../requests/getPresignedURL";
import { debugLogger } from "../../utils/logging";
import { uploadContentToS3 } from "../../requests/uploadContentToS3";
import log from "loglevel";
import { deployRequest } from "../../requests/deployCode";
import { CloudAdapter, GenezioCloudInput, GenezioCloudOutput } from "../cloudAdapter";
import { createTemporaryFolder, deleteFolder, zipDirectoryToDestinationPath } from "../../utils/file";
import { YamlFrontend } from "../../models/yamlProjectConfiguration";
import { createFrontendProject } from "../../requests/createFrontendProject";
import { getFrontendPresignedURL } from "../../requests/getFrontendPresignedURL";
import { FRONTEND_DOMAIN } from "../../constants";
import { getFileSize } from "../../utils/file";
import { CloudProviderIdentifier } from "../../models/cloudProviderIdentifier";

export const BUNDLE_SIZE_LIMIT = 262144000;

export class GenezioCloudAdapter implements CloudAdapter {
    async deploy(input: GenezioCloudInput[], projectConfiguration: ProjectConfiguration): Promise<GenezioCloudOutput> {
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

        const response = await deployRequest(projectConfiguration)

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

    async deployFrontend(projectName: string, projectRegion: string, frontend: YamlFrontend): Promise<string> {
        const archivePath = path.join(
            await createTemporaryFolder("genezio-"),
            `${frontend.subdomain}.zip`
        );
        debugLogger.debug("Creating temporary folder", archivePath);

        await zipDirectoryToDestinationPath(
            frontend.path,
            frontend.subdomain,
            archivePath
        );

        debugLogger.debug("Getting presigned URL...");
        const result = await getFrontendPresignedURL(
            frontend.subdomain,
            projectName
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
        await createFrontendProject(frontend.subdomain, projectName, projectRegion)

        // clean up temporary folder
        await deleteFolder(path.dirname(archivePath));

        return `https://${frontend.subdomain}.${FRONTEND_DOMAIN}`
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
