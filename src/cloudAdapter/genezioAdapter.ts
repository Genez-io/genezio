import { ProjectConfiguration } from "../models/projectConfiguration";
import cliProgress from 'cli-progress';
import { getPresignedURL } from "../requests/getPresignedURL";
import { debugLogger } from "../utils/logging";
import { uploadContentToS3 } from "../requests/uploadContentToS3";
import log from "loglevel";
import { deployRequest } from "../requests/deployCode";
import { CloudAdapter, GenezioCloudInput, GenezioCloudOutput } from "./cloudAdapter";


export class GenezioCloudAdapter implements CloudAdapter {
    async deploy(input: GenezioCloudInput[], projectConfiguration: ProjectConfiguration): Promise<GenezioCloudOutput> {
        const multibar = new cliProgress.MultiBar({
            clearOnComplete: false,
            hideCursor: true,
            format: 'Uploading {filename}: {bar} | {value}% | {eta_formatted}',
        }, cliProgress.Presets.shades_grey);

        const promisesDeploy = input.map(async (element) => {
            const resultPresignedUrl = await getPresignedURL(
                projectConfiguration.region,
                "genezioDeploy.zip",
                projectConfiguration.name,
                element.name
            )

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
            methods: c.methods,
            functionUrl: c.cloudUrl,
            projectId: response.projectId
        }));

        return {
            classes: classesInfo,
        };
    }
}