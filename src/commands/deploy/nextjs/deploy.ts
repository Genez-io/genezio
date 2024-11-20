import fs from "fs";
import { GenezioDeployOptions } from "../../../models/commandOptions.js";
import git from "isomorphic-git";
import { YamlProjectConfiguration } from "../../../projectConfiguration/yaml/v2.js";
import path from "path";
import { debugLogger, log } from "../../../utils/logging.js";
import { $ } from "execa";
import { UserError } from "../../../errors.js";
import { getCloudProvider } from "../../../requests/getCloudProvider.js";
import { functionToCloudInput, getCloudAdapter } from "../genezio.js";
import { ProjectConfiguration } from "../../../models/projectConfiguration.js";
import { FunctionType, Language } from "../../../projectConfiguration/yaml/models.js";
import { getPackageManager, PackageManagerType } from "../../../packageManagers/packageManager.js";
import {
    FrontendPresignedURLAppType,
    getFrontendPresignedURL,
} from "../../../requests/getFrontendPresignedURL.js";
import { uploadContentToS3 } from "../../../requests/uploadContentToS3.js";
import { createTemporaryFolder, zipDirectoryToDestinationPath } from "../../../utils/file.js";
import { DeployCodeFunctionResponse } from "../../../models/deployCodeResponse.js";
import {
    createFrontendProjectV2,
    CreateFrontendV2Origin,
} from "../../../requests/createFrontendProject.js";
import { setEnvironmentVariables } from "../../../requests/setEnvironmentVariables.js";
import { GenezioCloudOutput } from "../../../cloudAdapter/cloudAdapter.js";
import {
    GENEZIO_FRONTEND_DEPLOYMENT_BUCKET,
    NEXT_JS_GET_ACCESS_KEY,
    NEXT_JS_GET_SECRET_ACCESS_KEY,
} from "../../../constants.js";
import colors from "colors";
import { computeAssetsPaths } from "./assets.js";
import * as Sentry from "@sentry/node";
import { randomUUID } from "crypto";
import { attemptToInstallDependencies, uploadEnvVarsFromFile, uploadUserCode } from "../utils.js";
import { readOrAskConfig } from "../utils.js";
import { SSRFrameworkComponentType } from "../../../models/projectOptions.js";
import { addSSRComponentToConfig } from "../../analyze/utils.js";

export async function nextJsDeploy(options: GenezioDeployOptions) {
    const genezioConfig = await readOrAskConfig(options.config);

    const cwd = process.cwd();
    const componentPath = genezioConfig.nextjs?.path
        ? path.resolve(cwd, genezioConfig.nextjs.path)
        : cwd;

    // Install dependencies
    const installDependenciesCommand = await attemptToInstallDependencies([], componentPath);

    // Install dependencies including the ISR package
    await attemptToInstallDependencies(
        [`@genezio/nextjs-isr-${genezioConfig.region}`],
        componentPath,
    );

    // Add nextjs component
    await addSSRComponentToConfig(
        options.config,
        {
            path: componentPath,
            packageManager: getPackageManager().command as PackageManagerType,
            scripts: {
                deploy: [`${installDependenciesCommand.command}`],
            },
        },
        SSRFrameworkComponentType.next,
    );

    writeNextConfig(componentPath, genezioConfig.region);
    await $({
        stdio: "inherit",
        cwd: componentPath,
        env: {
            ...process.env,
            NEXT_PRIVATE_STANDALONE: "true",
        },
    })`npx next build --no-lint`.catch(() => {
        throw new UserError("Failed to build the Next.js project. Check the logs above.");
    });

    await checkProjectLimitations(componentPath);

    const cacheToken = randomUUID();

    const [deploymentResult, domainName] = await Promise.all([
        // Deploy NextJs serverless functions
        deployFunction(genezioConfig, componentPath, options.stage),
        // Deploy NextJs static assets to S3
        deployStaticAssets(genezioConfig, options.stage, cacheToken, componentPath),
    ]);

    const [, , cdnUrl] = await Promise.all([
        // Upload the project code to S3 for in-browser editing
        uploadUserCode(genezioConfig.name, genezioConfig.region, options.stage, componentPath),
        // Set environment variables for the Next.js project
        setupEnvironmentVariables(deploymentResult, domainName, genezioConfig.region, cacheToken),
        // Deploy CDN that serves the Next.js app
        deployCDN(
            deploymentResult.functions[0],
            domainName,
            genezioConfig,
            options.stage,
            componentPath,
        ),
        uploadEnvVarsFromFile(
            options.env,
            deploymentResult.projectId,
            deploymentResult.projectEnvId,
            componentPath,
            options.stage || "prod",
            genezioConfig,
            SSRFrameworkComponentType.next,
        ),
    ]);

    log.info(
        `The app is being deployed at ${colors.cyan(cdnUrl)}. It might take a few moments to be available worldwide.`,
    );
}

async function checkProjectLimitations(cwd: string) {
    const assetsPath = path.join(cwd, ".next", "static");
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
            value: `${domainName}/_assets/`,
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
    deployedFunction: DeployCodeFunctionResponse,
    domainName: string,
    config: YamlProjectConfiguration,
    stage: string,
    cwd: string,
) {
    const PATH_NUMBER_LIMIT = 200;

    const serverOrigin: CreateFrontendV2Origin = {
        domain: {
            id: deployedFunction.id,
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
        { origin: serverOrigin, pattern: "api/*" },
        { origin: serverOrigin, pattern: "_next/data/*" },
        { origin: s3Origin, pattern: "_next/image*" },
        { origin: s3Origin, pattern: "_next/static*" },
        { origin: s3Origin, pattern: "*.*" },
    ];

    const assetsFolder = path.join(cwd, ".next", "static");
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
    cwd: string,
) {
    const getFrontendPresignedURLPromise = getFrontendPresignedURL(
        /* subdomain= */ undefined,
        /* projectName= */ config.name,
        stage,
        /* type= */ FrontendPresignedURLAppType.AutoGenerateDomain,
    );

    const temporaryFolder = await createTemporaryFolder();
    const archivePath = path.join(temporaryFolder, "next-static.zip");
    const staticAssetsPath = path.join(temporaryFolder, "next-static", "_assets");

    // Create base directory structure first
    await fs.promises.mkdir(staticAssetsPath, { recursive: true });
    await fs.promises.mkdir(path.join(staticAssetsPath, "_next"), { recursive: true });

    // Copy files after directories are created
    await Promise.all([
        fs.promises.cp(
            path.join(cwd, ".next", "static"),
            path.join(staticAssetsPath, "_next", "static"),
            { recursive: true },
        ),
        fs.promises.cp(
            path.join(cwd, ".next", "BUILD_ID"),
            path.join(staticAssetsPath, "BUILD_ID"),
        ),
        fs.promises.cp(path.join(cwd, "public"), staticAssetsPath, { recursive: true }),
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

async function deployFunction(config: YamlProjectConfiguration, cwd: string, stage?: string) {
    const cloudProvider = await getCloudProvider(config.name);
    const cloudAdapter = getCloudAdapter(cloudProvider);

    const cwdRelative = path.relative(process.cwd(), cwd) || ".";

    const serverFunction = {
        path: path.join(cwdRelative, ".next", "standalone"),
        name: "nextjs",
        entry: "server.js",
        handler: "handler",
        type: FunctionType.httpServer,
        port: 3000,
    };

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
            functions: [serverFunction],
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

    const projectGitRepositoryUrl = (await git.listRemotes({ fs, dir: process.cwd() })).find(
        (r) => r.remote === "origin",
    )?.url;

    const result = await cloudAdapter.deploy(
        cloudInputs,
        projectConfiguration,
        { stage },
        ["nextjs"],
        projectGitRepositoryUrl,
    );
    debugLogger.debug(`Deployed functions: ${JSON.stringify(result.functions)}`);

    return result;
}

function writeNextConfig(cwd: string, region: string) {
    const configExtensions = ["js", "cjs", "mjs", "ts"];
    const existingConfig = configExtensions.find((ext) =>
        fs.existsSync(path.join(cwd, `next.config.${ext}`)),
    );

    if (!existingConfig) {
        const extension = determineFileExtension(cwd);
        writeConfigFiles(cwd, extension, region);
        return;
    }

    const configPath = path.join(cwd, `next.config.${existingConfig}`);
    const handlerPath = `./cache-handler.${existingConfig}`;
    const isESM = existingConfig === "mjs";

    fs.writeFileSync(
        path.join(cwd, `cache-handler.${existingConfig}`),
        getCacheHandlerContent(existingConfig as "js" | "ts" | "mjs", region),
    );

    const content = fs.readFileSync(configPath, "utf8");
    const configMatch = content.match(/nextConfig\s*=\s*(\{[^]*?\n\})/m);

    if (!configMatch) {
        throw new Error("Invalid Next.js configuration format");
    }

    let config;
    try {
        config = eval(`(${configMatch[1]})`);
    } catch (error: unknown) {
        throw new Error(
            `Failed to parse Next.js config: ${error instanceof Error ? error.message : String(error)}`,
        );
    }

    const configContent = `/** @type {import('next').NextConfig} */
const nextConfig = {${JSON.stringify(config, null, 2)
        .slice(1, -1)
        .replace(/"([^"]+)":/g, "$1:")},
  cacheHandler: process.env.NODE_ENV === "production" ? "${handlerPath}" : undefined,
  cacheMaxMemorySize: 0
};

${isESM ? "export default nextConfig;" : "module.exports = nextConfig;"}`;

    fs.writeFileSync(configPath, configContent);
}

function determineFileExtension(cwd: string): "js" | "mjs" | "ts" {
    try {
        // Always prefer .mjs for Next.js config files
        const packageJson = JSON.parse(fs.readFileSync(path.join(cwd, "package.json"), "utf8"));
        return packageJson.type === "module" ? "mjs" : "js";
    } catch {
        return "js"; // Fallback to CommonJS
    }
}

function getConfigContent(extension: string): string {
    const isESM = extension === "mjs";
    const handlerPath = `./cache-handler.${extension}`;

    return `/** @type {import('next').NextConfig} */
const nextConfig = {
    cacheHandler: process.env.NODE_ENV === "production"
        ? ${isESM ? handlerPath : `require.resolve("${handlerPath}")`}
        : undefined,
    output: 'standalone',
    cacheMaxMemorySize: 0
}

${isESM ? "export default nextConfig;" : "module.exports = nextConfig;"}`;
}

function getCacheHandlerContent(extension: "ts" | "mjs" | "js", region: string): string {
    const imports = {
        ts: `import { IncrementalCache, Queue, TagCache } from "@genezio/nextjs-isr-${region}";

interface CacheOptions {
    tags?: string[];
    revalidate?: number;
}`,
        mjs: `import { IncrementalCache, Queue, TagCache } from "@genezio/nextjs-isr-${region}"`,
        js: `const { IncrementalCache, Queue, TagCache } = require("@genezio/nextjs-isr-${region}");`,
    };

    const exportStatement = extension === "js" ? "module.exports = " : "export default ";

    return `${imports[extension]}
            
const deployment = process.env["GENEZIO_DOMAIN_NAME"] || "";
const token = (process.env["GENEZIO_CACHE_TOKEN"] || "") + "/_cache/" + (process.env["NEXT_BUILD_ID"] || "");

${exportStatement}class CacheHandler {
    constructor(options) {
        this.queue = Queue;
        this.incrementalCache = IncrementalCache;
        this.tagCache = TagCache;
    }

    async get(key) {
        try {
            return await this.incrementalCache.get(deployment, token, key);
        } catch (error) {
            return null;
        }
    }

    async set(key, data, options) {
        try {
            await this.incrementalCache.set(deployment, token, key, data, options);
            
            if (options?.tags?.length) {
                await this.tagCache.writeTags(deployment, token, key, options.tags);
            }
        } catch (error) {
            console.error('Cache set error:', error);
        }
    }

    async revalidateTag(tag) {
        try {
            const paths = await this.tagCache.getByTag(deployment, token, tag);
            
            if (paths?.length) {
                await this.queue.send(deployment, token, {
                    type: 'revalidate',
                    paths
                });
            }
        } catch (error) {
            console.error('Tag revalidation error:', error);
        }
    }
}`;
}

function writeConfigFiles(cwd: string, extension: "js" | "mjs" | "ts", region: string): void {
    fs.writeFileSync(path.join(cwd, `next.config.${extension}`), getConfigContent(extension));

    fs.writeFileSync(
        path.join(cwd, `cache-handler.${extension}`),
        getCacheHandlerContent(extension as "js" | "ts" | "mjs", region),
    );
}
