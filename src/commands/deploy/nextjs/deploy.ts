import git from "isomorphic-git";
import fs from "fs";
import { GenezioDeployOptions } from "../../../models/commandOptions.js";
import { YamlProjectConfiguration } from "../../../projectConfiguration/yaml/v2.js";
import path from "path";
import { debugLogger, log } from "../../../utils/logging.js";
import { $ } from "execa";
import { UserError } from "../../../errors.js";
import { getCloudProvider } from "../../../requests/getCloudProvider.js";
import { functionToCloudInput, getCloudAdapter } from "../genezio.js";
import { ProjectConfiguration } from "../../../models/projectConfiguration.js";
import { FunctionType, Language } from "../../../projectConfiguration/yaml/models.js";
import {
    NODE_DEFAULT_PACKAGE_MANAGER,
    PackageManagerType,
} from "../../../packageManagers/packageManager.js";
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
import { GenezioCloudOutput } from "../../../cloudAdapter/cloudAdapter.js";
import {
    DASHBOARD_URL,
    GENEZIO_FRONTEND_DEPLOYMENT_BUCKET,
    NEXT_JS_GET_ACCESS_KEY,
    NEXT_JS_GET_SECRET_ACCESS_KEY,
} from "../../../constants.js";
import colors from "colors";
import { computeAssetsPaths } from "./assets.js";
import * as Sentry from "@sentry/node";
import { randomUUID } from "crypto";
import {
    actionDetectedEnvFile,
    attemptToInstallDependencies,
    prepareServicesPostBackendDeployment,
    prepareServicesPreBackendDeployment,
    createBackendEnvVarList,
    uploadUserCode,
} from "../utils.js";
import { readOrAskConfig } from "../utils.js";
import { DEFAULT_ARCHITECTURE, SSRFrameworkComponentType } from "../../../models/projectOptions.js";
import { addSSRComponentToConfig } from "../../analyze/utils.js";
import { EnvironmentVariable } from "../../../models/environmentVariables.js";
import { setEnvironmentVariables } from "../../../requests/setEnvironmentVariables.js";
import { warningMissingEnvironmentVariables } from "../../../utils/environmentVariables.js";
import { isCI } from "../../../utils/process.js";
import { createHash } from "../../../utils/strings.js";
export async function nextJsDeploy(options: GenezioDeployOptions) {
    const genezioConfig = await readOrAskConfig(options.config);
    const packageManagerType = genezioConfig.nextjs?.packageManager || NODE_DEFAULT_PACKAGE_MANAGER;

    // Base directory where genezio.yaml is located
    const projectCwd = process.cwd();
    const nextjsComponentPath = genezioConfig.nextjs?.path
        ? path.resolve(projectCwd, genezioConfig.nextjs.path)
        : projectCwd;

    // Give the user another chance if he forgot to add `--env` flag
    if (!isCI() && !options.env) {
        options.env = await actionDetectedEnvFile(
            nextjsComponentPath,
            genezioConfig.name,
            options.stage,
        );
    }

    // Prepare services before deploying (database, authentication, etc)
    await prepareServicesPreBackendDeployment(
        genezioConfig,
        genezioConfig.name,
        options.stage,
        options.env,
    );

    // Add nextjs component
    await addSSRComponentToConfig(
        options.config,
        {
            path: nextjsComponentPath,
            packageManager: packageManagerType,
        },
        SSRFrameworkComponentType.next,
    );

    // Copy project files to /tmp for building
    const tempBuildCwd = await createTemporaryFolder();
    debugLogger.debug(`Copying project files to ${tempBuildCwd}`);
    await fs.promises.cp(projectCwd, tempBuildCwd, {
        recursive: true,
        force: true,
        dereference: true,
    });

    const tempBuildComponentPath = path.resolve(tempBuildCwd, genezioConfig.nextjs?.path || ".");

    // Install dependencies with clean install
    if (fs.existsSync(path.join(tempBuildComponentPath, "package-lock.json"))) {
        await attemptToInstallDependencies([], tempBuildComponentPath, packageManagerType, true);
    } else {
        await attemptToInstallDependencies([], tempBuildComponentPath, packageManagerType);
    }

    // Install ISR package
    await attemptToInstallDependencies(
        [`@genezio/nextjs-isr-${genezioConfig.region}`],
        tempBuildComponentPath,
        packageManagerType,
    );

    writeNextConfig(tempBuildComponentPath, genezioConfig.region);
    await $({
        stdio: "inherit",
        cwd: tempBuildComponentPath,
        env: {
            ...process.env,
            NEXT_PRIVATE_STANDALONE: "true",
            NODE_ENV: "production",
        },
    })`npx next build`.catch(() => {
        throw new UserError("Failed to build the Next.js project. Check the logs above.");
    });

    await checkProjectLimitations(tempBuildComponentPath);

    const cacheToken = randomUUID();
    const sharpInstallFolder = await installSharp(tempBuildComponentPath);
    const environmentVariables = await createBackendEnvVarList(
        options.env,
        options.stage,
        genezioConfig,
        SSRFrameworkComponentType.next,
    );

    const [deploymentResult, domainName] = await Promise.all([
        // Deploy NextJs serverless functions
        deployFunction(genezioConfig, tempBuildComponentPath, options.stage, environmentVariables),
        // Deploy NextJs static assets to S3
        deployStaticAssets(genezioConfig, options.stage, cacheToken, tempBuildComponentPath),
    ]);

    const [, , cdnUrl] = await Promise.all([
        // Upload the project code to S3 for in-browser editing
        uploadUserCode(genezioConfig.name, genezioConfig.region, options.stage, projectCwd),
        // Set environment variables for the Next.js project
        setupEnvironmentVariables(
            deploymentResult,
            domainName,
            genezioConfig.region,
            cacheToken,
            sharpInstallFolder,
        ),
        // Deploy CDN that serves the Next.js app
        deployCDN(
            deploymentResult.functions[0],
            domainName,
            genezioConfig,
            options.stage,
            tempBuildComponentPath,
        ),
    ]);

    await warningMissingEnvironmentVariables(
        genezioConfig.nextjs?.path || "./",
        deploymentResult.projectId,
        deploymentResult.projectEnvId,
    );

    await prepareServicesPostBackendDeployment(genezioConfig, genezioConfig.name, options.stage);

    log.info(
        `The app is being deployed at ${colors.cyan(cdnUrl)}. It might take a few moments to be available worldwide.`,
    );

    log.info(
        `\nApp Dashboard URL: ${colors.cyan(`${DASHBOARD_URL}/project/${deploymentResult.projectId}/${deploymentResult.projectEnvId}`)}\n` +
            `${colors.dim("Here you can monitor logs, set up a custom domain, and more.")}\n`,
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
    sharpInstallFolder: string,
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
            name: "NEXT_SHARP_PATH",
            value: sharpInstallFolder,
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
        { origin: serverOrigin, pattern: "_next/image*" },
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
    let subdomain = config.nextjs?.subdomain;
    if (subdomain) {
        const finalStageName =
            stage != "" && stage != "prod" ? `-${stage.replaceAll(/[/_.]/gm, "-")}` : "";
        subdomain += finalStageName;
        if (subdomain.length > 63) {
            debugLogger.debug("Subdomain is too long. Generating random subdomain.");
            subdomain = config.nextjs?.subdomain?.substring(0, 55) + "-" + createHash(stage, 4);
        }
    }
    const getFrontendPresignedURLPromise = getFrontendPresignedURL(
        /* subdomain= */ subdomain,
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

    // Copy files after directories are created, handling cases where directories might not exist
    await Promise.all([
        fs.promises
            .access(path.join(cwd, ".next", "static"))
            .then(() =>
                fs.promises.cp(
                    path.join(cwd, ".next", "static"),
                    path.join(staticAssetsPath, "_next", "static"),
                    { recursive: true },
                ),
            )
            .catch(() => debugLogger.debug("No .next/static directory found, skipping...")),
        fs.promises.cp(
            path.join(cwd, ".next", "BUILD_ID"),
            path.join(staticAssetsPath, "BUILD_ID"),
        ),
        fs.promises
            .access(path.join(cwd, "public"))
            .then(() =>
                fs.promises.cp(path.join(cwd, "public"), staticAssetsPath, { recursive: true }),
            )
            .catch(() => debugLogger.debug("No public directory found, skipping...")),
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

async function deployFunction(
    config: YamlProjectConfiguration,
    cwd: string,
    stage?: string,
    environmentVariables?: EnvironmentVariable[],
): Promise<GenezioCloudOutput> {
    const cloudProvider = await getCloudProvider(config.name);
    const cloudAdapter = getCloudAdapter(cloudProvider);

    const cwdRelative = path.relative(process.cwd(), cwd) || ".";
    writeMountFolderConfig(cwd);

    const serverFunction = {
        path: ".",
        name: "nextjs",
        entry: "start.mjs",
        handler: "handler",
        type:
            config.nextjs?.type === FunctionType.persistent
                ? FunctionType.persistent
                : FunctionType.httpServer,
        timeout: config.nextjs?.timeout,
        storageSize: config.nextjs?.storageSize,
        instanceSize: config.nextjs?.instanceSize,
        vcpuCount: config.nextjs?.vcpuCount,
        memoryMb: config.nextjs?.memoryMb,
        maxConcurrentRequestsPerInstance: config.nextjs?.maxConcurrentRequestsPerInstance,
        maxConcurrentInstances: config.nextjs?.maxConcurrentInstances,
        cooldownTime: config.nextjs?.cooldownTime,
    };

    const deployConfig: YamlProjectConfiguration = {
        ...config,
        backend: {
            path: ".",
            language: {
                name: Language.ts,
                packageManager: PackageManagerType.npm,
                architecture: DEFAULT_ARCHITECTURE,
                ...(config.nextjs?.runtime !== undefined && { runtime: config.nextjs.runtime }),
            },
            functions: [serverFunction],
        },
    };

    await fs.promises
        .access(path.join(cwd, "public"))
        .then(() =>
            fs.promises.cp(
                path.join(cwd, "public"),
                path.join(cwd, ".next", "standalone", "public"),
                { recursive: true },
            ),
        )
        .catch(() => debugLogger.debug("No public directory found, skipping..."));

    await fs.promises
        .access(path.join(cwd, ".next", "static"))
        .then(() =>
            fs.promises.cp(
                path.join(cwd, ".next", "static"),
                path.join(cwd, ".next", "standalone", ".next", "static"),
                { recursive: true },
            ),
        )
        .catch(() => debugLogger.debug("No .next/static directory found, skipping..."));

    // create mkdir cache folder in .next
    await fs.promises.mkdir(path.join(cwd, ".next", "standalone", ".next", "cache", "images"), {
        recursive: true,
    });

    const projectConfiguration = new ProjectConfiguration(
        deployConfig,
        await getCloudProvider(deployConfig.name),
        {
            generatorResponses: [],
            classesInfo: [],
        },
    );
    const cloudInputs = await Promise.all(
        projectConfiguration.functions.map((f) =>
            functionToCloudInput(f, path.join(cwdRelative, ".next", "standalone")),
        ),
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
        environmentVariables,
    );
    debugLogger.debug(`Deployed functions: ${JSON.stringify(result.functions)}`);

    return result;
}

/**
 * Configures Next.js by managing the next.config file and adding Genezio-specific configurations.
 *
 * This function performs the following steps:
 * 1. If no next.config file exists, creates one with default settings
 * 2. If a next.config file exists:
 *    - Saves the user's original config to base-next.{ext}
 *    - Creates a new next.config that imports and extends the user's config
 *    - Adds Genezio-specific cache settings
 * 3. Creates a cache handler file for production use
 *
 * @param cwd - Current working directory where the Next.js project is located
 * @param region - AWS region for deployment
 */
function writeNextConfig(cwd: string, region: string) {
    const configExtensions = ["js", "cjs", "mjs", "ts"];
    let existingConfig = configExtensions.find((ext) =>
        fs.existsSync(path.join(cwd, `next.config.${ext}`)),
    );

    if (!existingConfig) {
        const extension = determineFileExtension(cwd);
        writeConfigFiles(cwd, extension, region);
        existingConfig = extension;
    }

    const genezioConfigPath = path.join(cwd, `next.config.${existingConfig}`);
    const userConfigPath = path.join(cwd, `base-next.${existingConfig}`);

    // Rename next.config.{ext} to base-next.{ext}
    fs.renameSync(genezioConfigPath, userConfigPath);

    const isCommonJS = existingConfig === "js" || existingConfig === "cjs";
    // Remove .ts extension for TypeScript imports
    const importPath = existingConfig === "ts" ? "./base-next" : `./base-next.${existingConfig}`;
    const importPathCacheHandler =
        existingConfig === "ts" ? "./cache-handler.js" : `./cache-handler.${existingConfig}`;

    const genezioConfigContent = isCommonJS
        ? `
const userConfig = require('${importPath}');

userConfig.cacheHandler = process.env.NODE_ENV === "production" ? require.resolve("${importPathCacheHandler}") : undefined;
userConfig.cacheMaxMemorySize = 0;

module.exports = userConfig;
`
        : `
import userConfig from '${importPath}';

userConfig.cacheHandler = process.env.NODE_ENV === "production" ? "${importPathCacheHandler}" : undefined;
userConfig.cacheMaxMemorySize = 0;

export default userConfig;
`;

    fs.writeFileSync(genezioConfigPath, genezioConfigContent);

    if (existingConfig === "ts") {
        fs.writeFileSync(path.join(cwd, `cache-handler.js`), getCacheHandlerContent("js", region));
    } else {
        fs.writeFileSync(
            path.join(cwd, `cache-handler.${existingConfig}`),
            getCacheHandlerContent(existingConfig as "js" | "ts" | "mjs", region),
        );
    }
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
        ? ${isESM ? `"${handlerPath}"` : `require.resolve("${handlerPath}")`}
        : undefined,
    cacheMaxMemorySize: 0
}

${isESM ? "export default nextConfig;" : "module.exports = nextConfig;"}`;
}

function writeMountFolderConfig(cwd: string) {
    const configPath = path.join(cwd, ".next", "standalone", "start.mjs");
    const content = `
import { exec } from 'child_process';

const target = '/tmp/package/.next/cache';
const source = '/tmp/next-cache';
exec(\`mkdir -p \${target}\`, (error, stdout, stderr) => {
  if (error) {
    console.error(\`Error1: \${error.message}\`);
    return;
  }
});

exec(\`mkdir -p \${source}\`, (error, stdout, stderr) => {
  if (error) {
    console.error(\`Error2: \${error.message}\`);
    return;
  }
});

exec(\`mount --bind \${source} \${target}\`, (error, stdout, stderr) => {
  if (error) {
    console.error(\`Error: \${error.message}\`);
    return;
  }
  if (stderr) {
    console.error(\`Stderr: \${stderr}\`);
    return;
  }
  console.log(\`Bind mount created successfully:\n\${stdout}\`);
});

const app = await import("./server.js");
`;

    fs.writeFileSync(configPath, content);
}

function getCacheHandlerContent(extension: "ts" | "mjs" | "js", region: string): string {
    const imports = {
        ts: `// @ts-nocheck
import { IncrementalCache, Queue, TagCache } from "@genezio/nextjs-isr-${region}";

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

// Install sharp dependency.
// Sharp uses some binary dependencies and we have to install the ones that are compatible with
// Genezio environment.
//
// Another issue is that the nextjs standalone build output includes only the minimal set of
// dependencies, so we have to install sharp in a separate folder and then reference it in the
// nextjs project using the environment variable NEXT_SHARP_PATH.
async function installSharp(cwd: string): Promise<string> {
    // Create folder
    const sharpPath = path.join(cwd, ".next", "standalone", "sharp");
    await fs.promises.mkdir(sharpPath, { recursive: true });

    // Create package.json with specific sharp version
    fs.writeFileSync(
        path.join(sharpPath, "package.json"),
        JSON.stringify({
            name: "sharp-project",
            version: "1.0.0",
            dependencies: {
                sharp: "^0.32.0",
            },
        }),
    );

    // Install sharp
    await $({
        stdio: "inherit",
        cwd: sharpPath,
        env: {
            ...process.env,
            NEXT_PRIVATE_STANDALONE: "true",
            npm_config_platform: "linux",
            npm_config_arch: "x64",
        },
    })`npm install`.catch(() => {
        log.warn("Failed to install sharp deps.");
    });

    // This is relative to where it is used by the nextjs code.
    return "../../../../sharp/node_modules/sharp";
}

function writeConfigFiles(cwd: string, extension: "js" | "mjs" | "ts", region: string): void {
    fs.writeFileSync(path.join(cwd, `next.config.${extension}`), getConfigContent(extension));

    fs.writeFileSync(
        path.join(cwd, `cache-handler.${extension}`),
        getCacheHandlerContent(extension as "js" | "ts" | "mjs", region),
    );
}
