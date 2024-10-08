import { $ } from "execa";
import glob from "glob";
import { GenezioDeployOptions } from "../../../models/commandOptions.js";
import { UserError } from "../../../errors.js";
import { YamlProjectConfiguration } from "../../../projectConfiguration/yaml/v2.js";
import { functionToCloudInput, getCloudAdapter } from "../genezio.js";
import { getCloudProvider } from "../../../requests/getCloudProvider.js";
import { FunctionType, Language } from "../../../projectConfiguration/yaml/models.js";
import { PackageManagerType } from "../../../packageManagers/packageManager.js";
import { ProjectConfiguration } from "../../../models/projectConfiguration.js";
import { debugLogger, log } from "../../../utils/logging.js";
import { readOrAskConfig, uploadUserCode } from "../utils.js";
import { existsSync } from "fs";
import { getPackageManager } from "../../../packageManagers/packageManager.js";
import path from "path";
import colors from "colors";
import {
    FrontendPresignedURLAppType,
    getFrontendPresignedURL,
} from "../../../requests/getFrontendPresignedURL.js";
import { createTemporaryFolder, zipDirectoryToDestinationPath } from "../../../utils/file.js";
import fs from "fs";
import { uploadContentToS3 } from "../../../requests/uploadContentToS3.js";
import {
    createFrontendProjectV2,
    CreateFrontendV2Origin,
    CreateFrontendV2Path,
} from "../../../requests/createFrontendProject.js";
import { DeployCodeFunctionResponse } from "../../../models/deployCodeResponse.js";
import { DeployType } from "../command.js";

export async function nuxtNitroDeploy(
    options: GenezioDeployOptions,
    deployType: DeployType.Nuxt | DeployType.Nitro,
) {
    // Check if node_modules exists
    if (!existsSync("node_modules")) {
        throw new UserError(
            `Please run \`${getPackageManager().command} install\` before deploying your Nuxt project. This will install the necessary dependencies.`,
        );
    }

    switch (deployType) {
        case DeployType.Nuxt:
            await $({
                stdio: "inherit",
                env: { NITRO_PRESET: "aws_lambda" },
            })`npx nuxi build --preset=aws_lambda`.catch(() => {
                throw new UserError(`Failed to build the Nuxt project. Check the logs above.
Note: If your Nuxt project was not migrated to Nuxt 3, please visit https://v2.nuxt.com/lts for guidance on migrating your project. Genezio supports only Nuxt 3 projects.`);
            });
            break;
        case DeployType.Nitro:
            await $({
                stdio: "inherit",
                env: { NITRO_PRESET: "aws_lambda" },
            })`npx nitro build --preset=aws_lambda`.catch(() => {
                throw new UserError("Failed to build the Nuxt project. Check the logs above.");
            });
            break;
        default:
            throw new Error(`Incorrect deployment type ${deployType}`);
    }

    const genezioConfig = await readOrAskConfig(options.config);
    const [cloudResult, domain] = await Promise.all([
        deployFunction(genezioConfig, options),
        deployStaticAssets(genezioConfig, options.stage),
    ]);

    const [cdnUrl] = await Promise.all([
        deployCDN(cloudResult.functions, domain, genezioConfig, options.stage),
        uploadUserCode(genezioConfig.name, genezioConfig.region, options.stage),
    ]);

    debugLogger.debug(`Deployed functions: ${JSON.stringify(cloudResult.functions)}`);

    log.info(
        `The app is being deployed at ${colors.cyan(cdnUrl)}. It might take a few moments to be available worldwide.`,
    );
}

async function deployFunction(config: YamlProjectConfiguration, options: GenezioDeployOptions) {
    const cloudProvider = await getCloudProvider(config.name);
    const cloudAdapter = getCloudAdapter(cloudProvider);

    const functions = [
        {
            path: ".output",
            name: "nuxt-server",
            entry: "server/index.mjs",
            handler: "handler",
            type: FunctionType.aws,
        },
    ];

    const deployConfig: YamlProjectConfiguration = {
        ...config,
        backend: {
            path: ".",
            language: {
                name: Language.js,
                runtime: "nodejs20.x",
                architecture: "x86_64",
                packageManager: PackageManagerType.npm,
            },
            functions,
        },
    };

    const projectConfiguration = new ProjectConfiguration(
        deployConfig,
        await getCloudProvider(deployConfig.name),
        {
            generatorResponses: [],
            classesInfo: [],
        },
    );
    const cloudInputs = await Promise.all(
        projectConfiguration.functions.map((f) => functionToCloudInput(f, ".")),
    );

    const result = await cloudAdapter.deploy(
        cloudInputs,
        projectConfiguration,
        { stage: options.stage },
        ["nuxt"],
    );

    return result;
}

async function deployCDN(
    deployedFunctions: DeployCodeFunctionResponse[],
    domainName: string,
    config: YamlProjectConfiguration,
    stage: string,
) {
    const serverOrigin: CreateFrontendV2Origin = {
        domain: {
            id: deployedFunctions[0].id,
            type: "function",
        },
        path: undefined,
        methods: ["GET", "HEAD", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
        cachePolicy: "custom-function-cache",
    };

    const s3Origin: CreateFrontendV2Origin = {
        domain: {
            id: "frontendHosting",
            type: "s3",
        },
        path: undefined,
        methods: ["GET", "HEAD", "OPTIONS"],
        cachePolicy: "caching-optimized",
    };

    const paths: CreateFrontendV2Path[] = [...(await computeAssetsPaths(s3Origin))];

    const { domain: distributionUrl } = await createFrontendProjectV2(
        domainName,
        config.name,
        config.region,
        stage,
        paths,
        /* defaultPath= */ {
            origin: serverOrigin,
        },
        ["nuxt"],
    );

    if (!distributionUrl.startsWith("https://") && !distributionUrl.startsWith("http://")) {
        return `https://${distributionUrl}`;
    }

    return distributionUrl;
}

async function deployStaticAssets(config: YamlProjectConfiguration, stage: string) {
    const getFrontendPresignedURLPromise = getFrontendPresignedURL(
        /* subdomain= */ undefined,
        /* projectName= */ config.name,
        stage,
        /* type= */ FrontendPresignedURLAppType.AutoGenerateDomain,
    );

    const temporaryFolder = await createTemporaryFolder();
    const archivePath = path.join(temporaryFolder, "nuxt-static.zip");

    await fs.promises.mkdir(path.join(temporaryFolder, "nuxt-static"));
    await fs.promises.cp(
        path.join(process.cwd(), ".output", "public"),
        path.join(temporaryFolder, "nuxt-static"),
        { recursive: true },
    );

    const { presignedURL, userId, domain } = await getFrontendPresignedURLPromise;
    debugLogger.debug(`Generated presigned URL for Next.js static files. Domain: ${domain}`);

    await zipDirectoryToDestinationPath(
        path.join(temporaryFolder, "nuxt-static"),
        domain,
        archivePath,
    );

    await uploadContentToS3(presignedURL, archivePath, undefined, userId);
    debugLogger.debug("Uploaded Nuxt static files to S3.");

    return domain;
}

async function computeAssetsPaths(
    s3Origin: CreateFrontendV2Origin,
): Promise<CreateFrontendV2Path[]> {
    const folder = path.join(process.cwd(), ".output", "public");
    return new Promise((resolve, reject) => {
        glob(
            "*",
            {
                dot: true,
                cwd: folder,
            },
            (err, files) => {
                if (err) {
                    reject(err);
                    return;
                }

                const paths: CreateFrontendV2Path[] = files.map((file) => ({
                    origin: s3Origin,
                    pattern: fs.lstatSync(path.join(folder, file)).isDirectory()
                        ? `${file}/*`
                        : file,
                }));
                resolve(paths);
            },
        );
    });
}
