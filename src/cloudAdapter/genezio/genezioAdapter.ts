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
    GenezioCloudInputType,
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
import { getFileSize } from "../../utils/file.js";
import { CloudProviderIdentifier } from "../../models/cloudProviderIdentifier.js";
import { calculateBiggestFiles } from "../../utils/calculateBiggestProjectFiles.js";
import Table from "cli-table";
import { UserError } from "../../errors.js";
import { stdout } from "process";
import { createHash } from "../../utils/strings.js";
import { EnvironmentVariable } from "../../models/environmentVariables.js";

// The maximum size of a bundle is 1.524e9 bytes approx 1.5GB.
const BUNDLE_SIZE_LIMIT = 1.524e9;
const PERSISTENT_BUNDLE_SIZE_LIMIT = 5.0e9; // 5GB

async function handleBigElementSizeError(
    element: GenezioCloudInput,
    projectConfiguration: ProjectConfiguration,
    BUNDLE_SIZE_LIMIT: number = 1.524e9,
): Promise<void> {
    const size = await getFileSize(element.archivePath);
    if (size > BUNDLE_SIZE_LIMIT) {
        throw new UserError(
            `Your ${element.type} ${element.name} is too big: ${size} bytes. The maximum size is ${(BUNDLE_SIZE_LIMIT / 1048576).toFixed(2)}MB. Try to reduce the size of your ${element.type}.`,
        );
    }

    if (
        element.unzippedBundleSize > BUNDLE_SIZE_LIMIT &&
        element.type === GenezioCloudInputType.FUNCTION
    ) {
        throw new UserError(
            `Your function ${element.name} is too big: ${element.unzippedBundleSize} bytes. The maximum size is ${(BUNDLE_SIZE_LIMIT / 1048576).toFixed(2)}MB. Try to reduce the size of your function.`,
        );
    }

    if (
        !(
            element.unzippedBundleSize > BUNDLE_SIZE_LIMIT &&
            element.type === GenezioCloudInputType.CLASS
        )
    ) {
        debugLogger.debug(
            `The bundle for ${element.type} ${element.name} is ${(size / 1048576).toFixed(2)}MB out of ${(BUNDLE_SIZE_LIMIT / 1048576).toFixed(2)}MB.`,
        );
        return;
    }

    const { dependenciesInfo, allNonJsFilesPaths } = element;

    // Throw this error if bundle size is too big and the user is not using js or ts files.
    if (!dependenciesInfo || !allNonJsFilesPaths) {
        throw new UserError(
            `Your ${element.type} ${element.name} is too big: ${element.unzippedBundleSize} bytes. The maximum size is ${(BUNDLE_SIZE_LIMIT / 1048576).toFixed(2)}MB. Try to reduce the size of your class.`,
        );
    }

    const allfilesSize = await calculateBiggestFiles(dependenciesInfo, allNonJsFilesPaths);

    const dependenciesTable = new Table({
        head: ["Biggest Dependencies", "Size"],
    });

    const filesTable = new Table({
        head: [
            `Biggest Non-${projectConfiguration.classes[0].language.toUpperCase()} Files`,
            "Size",
        ],
    });

    const maxLength = Math.max(allfilesSize.dependenciesSize.length, allfilesSize.filesSize.length);

    for (let i = 0; i < maxLength; i++) {
        const formatedDep: string = allfilesSize.dependenciesSize[i]
            ? allfilesSize.dependenciesSize[i]
            : "";
        const formatedNonJsFile: string = allfilesSize.filesSize[i]
            ? allfilesSize.filesSize[i]
            : "";

        if (formatedDep.split("->")[0] && formatedDep.split("->")[1]) {
            dependenciesTable.push([formatedDep.split("->")[0], formatedDep.split("->")[1]]);
        }

        if (formatedNonJsFile.split("->")[0] && formatedNonJsFile.split("->")[1]) {
            filesTable.push([formatedNonJsFile.split("->")[0], formatedNonJsFile.split("->")[1]]);
        }
    }

    log.info(dependenciesTable.toString());
    log.info(filesTable.toString());
    throw new UserError(`
Class ${element.name} is too big: ${(element.unzippedBundleSize / 1048576).toFixed(
        2,
    )}MB. The maximum size is ${
        BUNDLE_SIZE_LIMIT / 1048576
    }MB. Try to reduce the size of your class.
`);
}
export class GenezioCloudAdapter implements CloudAdapter {
    async deploy(
        input: GenezioCloudInput[],
        projectConfiguration: ProjectConfiguration,
        cloudAdapterOptions: CloudAdapterOptions,
        stack: string[] = [],
        sourceRepository?: string,
        environmentVariables?: EnvironmentVariable[],
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
            await handleBigElementSizeError(
                element,
                projectConfiguration,
                element.persistent ? PERSISTENT_BUNDLE_SIZE_LIMIT : BUNDLE_SIZE_LIMIT,
            );

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
            environmentVariables,
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
