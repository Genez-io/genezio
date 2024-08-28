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
import { readOrAskConfig } from "../utils.js";
import { existsSync } from "fs";
import { getPackageManager } from "../../../packageManagers/packageManager.js";
import path from "path";
import colors from "colors";
import { getFrontendPresignedURL } from "../../../requests/getFrontendPresignedURL.js";
import { createTemporaryFolder, zipDirectoryToDestinationPath } from "../../../utils/file.js";
import fs from "fs";
import { uploadContentToS3 } from "../../../requests/uploadContentToS3.js";
import {
    createFrontendProjectV2,
    CreateFrontendV2Origin,
    CreateFrontendV2Path,
} from "../../../requests/createFrontendProject.js";
import { DeployCodeFunctionResponse } from "../../../models/deployCodeResponse.js";

export async function nuxtDeploy(options: GenezioDeployOptions) {
    // Check if node_modules exists
    if (!existsSync("node_modules")) {
        throw new UserError(
            `Please run \`${getPackageManager().command} install\` before deploying your Nuxt project. This will install the necessary dependencies.`,
        );
    }
    await $({ stdio: "inherit" })`npx nuxi build --preset=aws_lambda`.catch(() => {
        throw new UserError("Failed to build the Nuxt project. Check the logs above.");
    });
    const genezioConfig = await readOrAskConfig(options.config);
    await deployFunctions(options, genezioConfig);
}

async function deployFunctions(options: GenezioDeployOptions, config: YamlProjectConfiguration) {
    const cloudProvider = await getCloudProvider(config.name);
    const cloudAdapter = getCloudAdapter(cloudProvider);

    const functions = [
        {
            path: ".output",
            name: "nuxt-server",
            entry: path.join("server", "index.mjs"),
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

    const domain = await deployStaticAssets(config, options.stage);

    const cdnUrl = await deployCDN(result.functions, domain, config, options.stage);

    debugLogger.debug(`Deployed functions: ${JSON.stringify(result.functions)}`);

    log.info(
        `The app is being deployed at ${colors.cyan(cdnUrl)}. It might take a few moments to be available worldwide.`,
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
        /* type= */ "nextjs",
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
