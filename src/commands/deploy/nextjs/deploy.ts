import fs, { existsSync, readFileSync } from "fs";
import { GenezioDeployOptions } from "../../../models/commandOptions.js";
import { YamlConfigurationIOController } from "../../../projectConfiguration/yaml/v2.js";
import { YamlProjectConfiguration } from "../../../projectConfiguration/yaml/v2.js";
import inquirer from "inquirer";
import path from "path";
import { regions } from "../../../utils/configs.js";
import { checkProjectName } from "../../create/create.js";
import { debugLogger, log } from "../../../utils/logging.js";
import { $ } from "execa";
import { UserError } from "../../../errors.js";
import { getCloudProvider } from "../../../requests/getCloudProvider.js";
import { functionToCloudInput, getCloudAdapter } from "../genezio.js";
import { ProjectConfiguration } from "../../../models/projectConfiguration.js";
import { FunctionType, Language } from "../../../projectConfiguration/yaml/models.js";
import { getPackageManager, PackageManagerType } from "../../../packageManagers/packageManager.js";
import { getFrontendPresignedURL } from "../../../requests/getFrontendPresignedURL.js";
import { uploadContentToS3 } from "../../../requests/uploadContentToS3.js";
import {
    createTemporaryFolder,
    getAllFilesFromPath,
    zipDirectory,
    zipDirectoryToDestinationPath,
} from "../../../utils/file.js";
import { DeployCodeFunctionResponse } from "../../../models/deployCodeResponse.js";
import {
    createFrontendProjectV2,
    CreateFrontendV2Origin,
} from "../../../requests/createFrontendProject.js";
import { setEnvironmentVariables } from "../../../requests/setEnvironmentVariables.js";
import { GenezioCloudOutput } from "../../../cloudAdapter/cloudAdapter.js";
import {
    ENVIRONMENT,
    GENEZIO_FRONTEND_DEPLOYMENT_BUCKET,
    NEXT_JS_GET_ACCESS_KEY,
    NEXT_JS_GET_SECRET_ACCESS_KEY,
} from "../../../constants.js";
import getProjectInfoByName from "../../../requests/getProjectInfoByName.js";
import colors from "colors";
import {
    uniqueNamesGenerator,
    adjectives,
    colors as ungColors,
    animals,
} from "unique-names-generator";
import { getPresignedURLForProjectCodePush } from "../../../requests/getPresignedURLForProjectCodePush.js";
import { computeAssetsPaths } from "./assets.js";
import * as Sentry from "@sentry/node";
import { randomUUID } from "crypto";
import { EdgeFunction, getEdgeFunctions } from "./edge.js";

export async function nextJsDeploy(options: GenezioDeployOptions) {
    // Check if node_modules exists
    if (!existsSync("node_modules")) {
        throw new UserError(
            `Please run \`${getPackageManager().command} install\` before deploying your Next.js project. This will install the necessary dependencies.`,
        );
    }

    const genezioConfig = await readOrAskConfig(options.config);

    const edgeFunctions = await getEdgeFunctions();
    await writeOpenNextConfig(genezioConfig.region, edgeFunctions);
    // Build the Next.js project
    await $({ stdio: "inherit" })`npx --yes @genezio/open-next@latest build`.catch(() => {
        throw new UserError("Failed to build the Next.js project. Check the logs above.");
    });

    await checkProjectLimitations();

    const cacheToken = randomUUID();

    const [deploymentResult, domainName] = await Promise.all([
        // Deploy NextJs serverless functions
        deployFunctions(genezioConfig, options.stage),
        // Deploy NextJs static assets to S3
        deployStaticAssets(genezioConfig, options.stage, cacheToken),
    ]);

    const [, , cdnUrl] = await Promise.all([
        // Upload the project code to S3 for in-browser editing
        uploadUserCode(genezioConfig.name, genezioConfig.region, options.stage),
        // Set environment variables for the Next.js project
        setupEnvironmentVariables(deploymentResult, domainName, genezioConfig.region, cacheToken),
        // Deploy CDN that serves the Next.js app
        deployCDN(
            deploymentResult.functions,
            domainName,
            genezioConfig,
            options.stage,
            edgeFunctions,
        ),
    ]);

    log.info(
        `The app is being deployed at ${colors.cyan(cdnUrl)}. It might take a few moments to be available worldwide.`,
    );
}

async function uploadUserCode(name: string, region: string, stage: string): Promise<void> {
    const tmpFolderProject = await createTemporaryFolder();
    debugLogger.debug(`Creating archive of the project in ${tmpFolderProject}`);
    const promiseZip = zipDirectory(process.cwd(), path.join(tmpFolderProject, "projectCode.zip"), [
        "**/node_modules/*",
        "./node_modules/*",
        "node_modules/*",
        "**/node_modules",
        "./node_modules",
        "node_modules",
        "node_modules/**",
        "**/node_modules/**",
        // ignore all .git files
        "**/.git/*",
        "./.git/*",
        ".git/*",
        "**/.git",
        "./.git",
        ".git",
        ".git/**",
        "**/.git/**",
        // ignore all .next files
        "**/.next/*",
        "./.next/*",
        ".next/*",
        "**/.next",
        "./.next",
        ".next",
        ".next/**",
        "**/.next/**",
        // ignore all .open-next files
        "**/.open-next/*",
        "./.open-next/*",
        ".open-next/*",
        "**/.open-next",
        "./.open-next",
        ".open-next",
        ".open-next/**",
        "**/.open-next/**",
        // ignore all .vercel files
        "**/.vercel/*",
        "./.vercel/*",
        ".vercel/*",
        "**/.vercel",
        "./.vercel",
        ".vercel",
        ".vercel/**",
        "**/.vercel/**",
        // ignore all .turbo files
        "**/.turbo/*",
        "./.turbo/*",
        ".turbo/*",
        "**/.turbo",
        "./.turbo",
        ".turbo",
        ".turbo/**",
        "**/.turbo/**",
        // ignore all .sst files
        "**/.sst/*",
        "./.sst/*",
        ".sst/*",
        "**/.sst",
        "./.sst",
        ".sst",
        ".sst/**",
        "**/.sst/**",
    ]);

    await promiseZip;
    const presignedUrlForProjectCode = await getPresignedURLForProjectCodePush(region, name, stage);
    return uploadContentToS3(
        presignedUrlForProjectCode,
        path.join(tmpFolderProject, "projectCode.zip"),
    );
}

async function checkProjectLimitations() {
    const assetsPath = path.join(process.cwd(), ".open-next", "assets");
    const paths = await computeAssetsPaths(assetsPath, {} as CreateFrontendV2Origin);

    if (paths.length > 195) {
        throw new UserError(
            "We currently do not support having more than 195 files and folders within the public/ directory at the root level. As a workaround, you can organize some of these files into a subfolder.",
        );
    }
}

async function setupEnvironmentVariables(
    deploymentResult: GenezioCloudOutput,
    domainName: string,
    region: string,
    cacheToken: string,
) {
    debugLogger.debug(`Setting Next.js environment variables, ${JSON.stringify(deploymentResult)}`);
    await setEnvironmentVariables(deploymentResult.projectId, deploymentResult.projectEnvId, [
        {
            name: "BUCKET_KEY_PREFIX",
            value: `${domainName}/_assets`,
        },
        {
            name: "BUCKET_NAME",
            value: GENEZIO_FRONTEND_DEPLOYMENT_BUCKET + "-" + region,
        },
        {
            name: "GENEZIO_CACHE_TOKEN",
            value: cacheToken,
        },
        {
            name: "GENEZIO_DOMAIN_NAME",
            value: domainName,
        },
        {
            name: "AWS_ACCESS_KEY_ID",
            value: NEXT_JS_GET_ACCESS_KEY,
        },
        {
            name: "AWS_SECRET_ACCESS_KEY",
            value: NEXT_JS_GET_SECRET_ACCESS_KEY,
        },
        {
            name: "AWS_REGION",
            value: region,
        },
    ]);
}

async function deployCDN(
    deployedFunctions: DeployCodeFunctionResponse[],
    domainName: string,
    config: YamlProjectConfiguration,
    stage: string,
    edgeFunctions: EdgeFunction[] = [],
) {
    const PATH_NUMBER_LIMIT = 200;

    const externalPaths: {
        origin: CreateFrontendV2Origin;
        pattern: string;
    }[] = deployedFunctions
        .filter((f) => f.name !== "function-image-optimization" && f.name !== "function-default")
        .map((f) => {
            return {
                origin: {
                    domain: {
                        id: f.id,
                        type: "function",
                    },
                    path: undefined,
                    methods: ["GET", "HEAD", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
                    cachePolicy: "custom-function-cache",
                },
                pattern: edgeFunctions.find((ef) => ef.name === f.name)!.pattern,
            };
        });

    const serverOrigin: CreateFrontendV2Origin = {
        domain: {
            id: deployedFunctions.find((f) => f.name === "function-default")?.id ?? "",
            type: "function",
        },
        path: undefined,
        methods: ["GET", "HEAD", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
        cachePolicy: "custom-function-cache",
    };

    const imageOptimizationOrigin: CreateFrontendV2Origin = {
        domain: {
            id: deployedFunctions.find((f) => f.name === "function-image-optimization")?.id ?? "",
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
        path: "_assets",
        methods: ["GET", "HEAD", "OPTIONS"],
        cachePolicy: "caching-optimized",
    };

    const paths = [
        ...externalPaths,
        { origin: serverOrigin, pattern: "api/*" },
        { origin: serverOrigin, pattern: "_next/data/*" },
        { origin: imageOptimizationOrigin, pattern: "_next/image*" },
    ];

    const assetsFolder = path.join(process.cwd(), ".open-next", "assets");
    paths.push(...(await computeAssetsPaths(assetsFolder, s3Origin)));

    if (paths.length >= PATH_NUMBER_LIMIT) {
        Sentry.captureException(new Error(`Too many paths for the CDN. Length: ${paths.length}`));
    }

    const { domain: distributionUrl } = await createFrontendProjectV2(
        domainName,
        config.name,
        config.region,
        stage,
        paths,
        /* defaultPath= */ {
            origin: serverOrigin,
        },
        ["nextjs"],
    );

    if (!distributionUrl.startsWith("https://") && !distributionUrl.startsWith("http://")) {
        return `https://${distributionUrl}`;
    }

    return distributionUrl;
}

async function deployStaticAssets(
    config: YamlProjectConfiguration,
    stage: string,
    cacheToken: string,
) {
    const getFrontendPresignedURLPromise = getFrontendPresignedURL(
        /* subdomain= */ undefined,
        /* projectName= */ config.name,
        stage,
        /* type= */ "nextjs",
    );

    const temporaryFolder = await createTemporaryFolder();
    const archivePath = path.join(temporaryFolder, "next-static.zip");

    await fs.promises.mkdir(path.join(temporaryFolder, "next-static"));
    await Promise.all([
        fs.promises.cp(
            path.join(process.cwd(), ".open-next", "assets"),
            path.join(temporaryFolder, "next-static", "_assets"),
            { recursive: true },
        ),
        fs.promises.cp(
            path.join(process.cwd(), ".open-next", "cache"),
            path.join(temporaryFolder, "next-static", cacheToken, "_cache"),
            { recursive: true },
        ),
    ]);

    const { presignedURL, userId, domain } = await getFrontendPresignedURLPromise;
    debugLogger.debug(`Generated presigned URL for Next.js static files. Domain: ${domain}`);

    await zipDirectoryToDestinationPath(
        path.join(temporaryFolder, "next-static"),
        domain,
        archivePath,
    );

    await uploadContentToS3(presignedURL, archivePath, undefined, userId);
    debugLogger.debug("Uploaded Next.js static files to S3.");

    return domain;
}

async function deployFunctions(config: YamlProjectConfiguration, stage?: string) {
    const cloudProvider = await getCloudProvider(config.name);
    const cloudAdapter = getCloudAdapter(cloudProvider);
    // list all folders from .open-next/server-functions in nodejs

    const serverSubfolders = await getAllFilesFromPath(".open-next/server-functions", false);

    const functions = serverSubfolders.map((folder) => {
        return {
            path: `.open-next/server-functions/${folder.name}`,
            name: folder.name,
            entry: "index.mjs",
            handler: "handler",
            type: FunctionType.aws,
        };
    });

    functions.push({
        path: ".open-next/image-optimization-function",
        name: "image-optimization",
        entry: "index.mjs",
        handler: "handler",
        type: FunctionType.aws,
    });

    const deployConfig: YamlProjectConfiguration = {
        ...config,
        backend: {
            path: ".",
            language: {
                name: Language.ts,
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

    const result = await cloudAdapter.deploy(cloudInputs, projectConfiguration, { stage }, [
        "nextjs",
    ]);
    debugLogger.debug(`Deployed functions: ${JSON.stringify(result.functions)}`);

    return result;
}

async function writeOpenNextConfig(region: string, edgeFunctionPaths: EdgeFunction[]) {
    let functions = "";

    if (edgeFunctionPaths.length > 0) {
        functions += "functions: {\n";
        for (const index in edgeFunctionPaths) {
            const f = edgeFunctionPaths[index];
            functions += `   edge${index}: {
    runtime: 'edge',
    routes: ["${f.path}"],
    patterns: ['${f.pattern}'],
    },
`;
        }
        functions += "},";
    }

    const OPEN_NEXT_CONFIG = `
    import { IncrementalCache, Queue, TagCache } from "@genezio/nextjs-isr-${region}";
    
    const deployment = process.env["GENEZIO_DOMAIN_NAME"] || "";
    const token = (process.env["GENEZIO_CACHE_TOKEN"] || "") + "/_cache/" + (process.env["NEXT_BUILD_ID"] || "");

    const queue = () => ({
        name: "genezio-queue",
        send: Queue.send.bind(null, deployment, token),
    });

    const incrementalCache = () => ({
        name: "genezio-incremental-cache",
        get: IncrementalCache.get.bind(null, deployment, token),
        set: IncrementalCache.set.bind(null, deployment, token),
        delete: IncrementalCache.delete.bind(null, deployment, token),
    });

    const tagCache = () => ({
        name: "genzio-tag-cache",
        getByTag: TagCache.getByTag.bind(null, deployment, token),
        getByPath: TagCache.getByPath.bind(null, deployment, token),
        getLastModified: TagCache.getLastModified.bind(null, deployment, token),
        writeTags: TagCache.writeTags.bind(null, deployment, token),
    });

    const config = {
        default: {
            override: {
                queue,
                incrementalCache,
                tagCache,
            },
        },
        ${functions}
        imageOptimization: {
            arch: "x64",
        },
    };

    export default config;`;

    // Write the open-next configuration
    // TODO: Check if the file already exists and merge the configurations, instead of overwriting it.
    const openNextConfigPath = path.join(process.cwd(), "open-next.config.ts");
    await fs.promises.writeFile(openNextConfigPath, OPEN_NEXT_CONFIG);

    const tag = ENVIRONMENT === "prod" ? "latest" : "dev";
    await getPackageManager().install([`@genezio/nextjs-isr-${region}@${tag}`]);
}

async function readOrAskConfig(configPath: string): Promise<YamlProjectConfiguration> {
    const configIOController = new YamlConfigurationIOController(configPath);
    if (!existsSync(configPath)) {
        const name = await readOrAskProjectName();

        let region = regions[0].value;
        if (process.env["CI"] !== "true") {
            ({ region } = await inquirer.prompt([
                {
                    type: "list",
                    name: "region",
                    message: "Select the Genezio project region:",
                    choices: regions,
                },
            ]));
        } else {
            log.info(
                "Using the default region for the project because no `genezio.yaml` file was found.",
            );
        }

        await configIOController.write({ name, region, yamlVersion: 2 });
    }

    return await configIOController.read();
}

async function readOrAskProjectName(): Promise<string> {
    if (existsSync("package.json")) {
        // Read package.json content
        const packageJson = readFileSync("package.json", "utf-8");
        const packageJsonName = JSON.parse(packageJson)["name"];

        const validProjectName: boolean = await (async () => checkProjectName(packageJsonName))()
            .then(() => true)
            .catch(() => false);

        const projectExists = await getProjectInfoByName(packageJsonName)
            .then(() => true)
            .catch(() => false);

        // We don't want to automatically use the package.json name if the project
        // exists, because it could overwrite the existing project by accident.
        if (packageJsonName !== undefined && validProjectName && !projectExists)
            return packageJsonName;
    }

    let name = uniqueNamesGenerator({
        dictionaries: [ungColors, adjectives, animals],
        separator: "-",
        style: "lowerCase",
        length: 3,
    });
    if (process.env["CI"] !== "true") {
        // Ask for project name
        ({ name } = await inquirer.prompt([
            {
                type: "input",
                name: "name",
                message: "Enter the Genezio project name:",
                default: path.basename(process.cwd()),
                validate: checkProjectName,
            },
        ]));
    } else {
        log.info("Using a random name for the project because no `genezio.yaml` file was found.");
    }

    return name;
}
