import fs, { cpSync, existsSync, mkdirSync, readFileSync } from "fs";
import { GenezioDeployOptions } from "../../models/commandOptions.js";
import { YamlConfigurationIOController } from "../../yamlProjectConfiguration/v2.js";
import { YamlProjectConfiguration } from "../../yamlProjectConfiguration/v2.js";
import inquirer from "inquirer";
import path from "path";
import { regions } from "../../utils/configs.js";
import { checkProjectName } from "../create/create.js";
import { debugLogger, log } from "../../utils/logging.js";
import { $ } from "execa";
import { UserError } from "../../errors.js";
import { getCloudProvider } from "../../requests/getCloudProvider.js";
import { functionToCloudInput, getCloudAdapter } from "./genezio.js";
import { ProjectConfiguration } from "../../models/projectConfiguration.js";
import { FunctionType, Language } from "../../yamlProjectConfiguration/models.js";
import { PackageManagerType } from "../../packageManagers/packageManager.js";
import { getFrontendPresignedURL } from "../../requests/getFrontendPresignedURL.js";
import { uploadContentToS3 } from "../../requests/uploadContentToS3.js";
import { createTemporaryFolder, zipDirectoryToDestinationPath } from "../../utils/file.js";
import { DeployCodeFunctionResponse } from "../../models/deployCodeResponse.js";
import {
    createFrontendProjectV2,
    CreateFrontendV2Origin,
} from "../../requests/createFrontendProject.js";

export async function nextJsDeploy(options: GenezioDeployOptions) {
    await writeOpenNextConfig();
    // Build the Next.js project
    await $({ stdio: "inherit" })`npx --yes open-next@^3 build`.catch(() => {
        throw new UserError("Failed to build the Next.js project. Check the logs above.");
    });

    const genezioConfig = await readOrAskConfig(options.config);

    // Deploy NextJs serverless functions
    const deployedFunctions = await deployFunctions(genezioConfig, options.stage);

    // Deploy NextJs static assets to S3
    const domainName = await deployStaticAssets(genezioConfig, options.stage);

    // Deploy CDN that serves the Next.js app
    const cdnUrl = await deployCDN(deployedFunctions, domainName, genezioConfig, options.stage);

    log.info(`Successfully deployed the Next.js project at ${cdnUrl}.`);
}

async function deployCDN(
    deployedFunctions: DeployCodeFunctionResponse[],
    domainName: string,
    config: YamlProjectConfiguration,
    stage: string,
) {
    const serverOrigin: CreateFrontendV2Origin = {
        domain: {
            id: deployedFunctions.find((f) => f.name === "function-server")?.id ?? "",
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
        { origin: serverOrigin, pattern: "api/*" },
        { origin: serverOrigin, pattern: "_next/data/*" },
        { origin: imageOptimizationOrigin, pattern: "_next/image*" },
    ];
    const assetsFolder = path.join(process.cwd(), ".open-next", "assets");
    for (const file of fs.readdirSync(assetsFolder)) {
        if (fs.statSync(path.join(assetsFolder, file)).isDirectory()) {
            paths.push({
                origin: s3Origin,
                pattern: `${file}/*`,
            });
        } else {
            paths.push({
                origin: s3Origin,
                pattern: file,
            });
        }
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
    );

    return distributionUrl;
}

async function deployStaticAssets(config: YamlProjectConfiguration, stage: string) {
    const { presignedURL, userId, domain } = await getFrontendPresignedURL(
        /* subdomain= */ undefined,
        /* projectName= */ config.name,
        stage,
        /* type= */ "nextjs",
    );
    debugLogger.debug(`Generated presigned URL for Next.js static files. Domain: ${domain}`);

    const temporaryFolder = await createTemporaryFolder();
    const archivePath = path.join(temporaryFolder, "next-static.zip");

    mkdirSync(path.join(temporaryFolder, "next-static"));
    cpSync(
        path.join(process.cwd(), ".open-next", "assets"),
        path.join(temporaryFolder, "next-static", "_assets"),
        { recursive: true },
    );
    cpSync(
        path.join(process.cwd(), ".open-next", "cache"),
        path.join(temporaryFolder, "next-static", "_cache"),
        { recursive: true },
    );

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
            functions: [
                {
                    path: ".open-next/server-functions/default",
                    name: "server",
                    entry: "index.mjs",
                    handler: "handler",
                    type: FunctionType.aws,
                },
                {
                    path: ".open-next/image-optimization-function",
                    name: "image-optimization",
                    entry: "index.mjs",
                    handler: "handler",
                    type: FunctionType.aws,
                },
            ],
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

    const result = await cloudAdapter.deploy(cloudInputs, projectConfiguration, { stage });
    debugLogger.debug(`Deployed functions: ${JSON.stringify(result.functions)}`);

    return result.functions;
}

async function writeOpenNextConfig() {
    const OPEN_NEXT_CONFIG = `
    const config = {
        default: {},
        imageOptimization: {
            arch: "x64",
        },
    }
    export default config;`;

    // Write the open-next configuration
    // TODO: Check if the file already exists and merge the configurations, instead of overwriting it.
    const openNextConfigPath = path.join(process.cwd(), "open-next.config.ts");
    await fs.promises.writeFile(openNextConfigPath, OPEN_NEXT_CONFIG);
}

async function readOrAskConfig(configPath: string): Promise<YamlProjectConfiguration> {
    const configIOController = new YamlConfigurationIOController(configPath);
    if (!existsSync(configPath)) {
        const name = await readOrAskProjectName();
        const { region }: { region: string } = await inquirer.prompt([
            {
                type: "list",
                name: "region",
                message: "Select the project region:",
                choices: regions,
            },
        ]);

        await configIOController.write({ name, region, yamlVersion: 2 });
    }

    return await configIOController.read();
}

async function readOrAskProjectName(): Promise<string> {
    if (existsSync("package.json")) {
        // Read package.json content
        const packageJson = readFileSync("package.json", "utf-8");
        const packageJsonObj = JSON.parse(packageJson);

        const validProjectName: boolean = await (async () =>
            checkProjectName(packageJsonObj["name"]))()
            .then(() => true)
            .catch(() => false);
        // TODO: Check if a project with this name is not already deployed. We don't want to overwrite an existing project by accident.
        if (packageJsonObj["name"] !== undefined && validProjectName) return packageJsonObj["name"];
    }

    // Ask for project name
    const { name }: { name: string } = await inquirer.prompt([
        {
            type: "input",
            name: "name",
            message: "Enter the project name:",
            default: path.basename(process.cwd()),
            validate: checkProjectName,
        },
    ]);

    return name;
}
