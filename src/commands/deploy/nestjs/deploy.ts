import path from "path";
import fs from "fs";
import colors from "colors";
import { $ } from "execa";
import { GenezioDeployOptions } from "../../../models/commandOptions.js";
import { log } from "../../../utils/logging.js";
import {
    attemptToInstallDependencies,
    readOrAskConfig,
    uploadEnvVarsFromFile,
    uploadUserCode,
} from "../utils.js";
import { addSSRComponentToConfig } from "../../analyze/utils.js";
import { getPackageManager, PackageManagerType } from "../../../packageManagers/packageManager.js";
import { SSRFrameworkComponentType } from "../../../models/projectOptions.js";
import { UserError } from "../../../errors.js";
import { YamlProjectConfiguration } from "../../../projectConfiguration/yaml/v2.js";
import { getCloudProvider } from "../../../requests/getCloudProvider.js";
import { functionToCloudInput, getCloudAdapter } from "../genezio.js";
import { FunctionType, Language } from "../../../projectConfiguration/yaml/models.js";
import { ProjectConfiguration } from "../../../models/projectConfiguration.js";

export async function nestJsDeploy(options: GenezioDeployOptions) {
    const genezioConfig = await readOrAskConfig(options.config);
    const cwd = process.cwd();
    const componentPath = genezioConfig.nestjs?.path
        ? path.resolve(cwd, genezioConfig.nestjs.path)
        : cwd;

    // Install dependencies
    const installDependenciesCommand = await attemptToInstallDependencies([], componentPath);

    // Add nestjs component to config
    await addSSRComponentToConfig(
        options.config,
        {
            path: componentPath,
            packageManager: getPackageManager().command as PackageManagerType,
            scripts: {
                deploy: [`${installDependenciesCommand.command}`],
            },
        },
        SSRFrameworkComponentType.nestjs,
    );

    // Build NestJS project
    await $({
        stdio: "inherit",
        cwd: componentPath,
    })`npx nest build`.catch(() => {
        throw new UserError("Failed to build the NestJS project. Check the logs above.");
    });

    const result = await deployFunction(genezioConfig, options, componentPath);

    await uploadEnvVarsFromFile(
        options.env,
        result.projectId,
        result.projectEnvId,
        componentPath,
        options.stage || "prod",
        genezioConfig,
        SSRFrameworkComponentType.nestjs,
    );

    await uploadUserCode(genezioConfig.name, genezioConfig.region, options.stage, componentPath);

    const functionUrl = result.functions.find((f) => f.name === "function-nest")?.cloudUrl;

    if (functionUrl) {
        log.info(
            `The app is being deployed at ${colors.cyan(functionUrl)}. It might take a few moments to be available worldwide.`,
        );
    } else {
        log.warn("No deployment URL was returned.");
    }
}

async function deployFunction(
    config: YamlProjectConfiguration,
    options: GenezioDeployOptions,
    cwd: string,
) {
    const cloudProvider = await getCloudProvider(config.name);
    const cloudAdapter = getCloudAdapter(cloudProvider);
    const cwdRelative = path.relative(process.cwd(), cwd) || ".";

    // Copiază node_modules în dist folosind fs.promises.cp
    await fs.promises
        .cp(
            path.join(cwdRelative, "node_modules"),
            path.join(cwdRelative, "dist", "node_modules"),
            { recursive: true },
        )
        .catch(() => {
            throw new UserError("Failed to copy node_modules to dist directory");
        });

    const serverFunction = {
        path: ".",
        name: "nest",
        entry: "main.js",
        type: FunctionType.httpServer,
    };

    const deployConfig: YamlProjectConfiguration = {
        ...config,
        backend: {
            path: cwdRelative,
            language: {
                name: Language.js,
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
        projectConfiguration.functions.map((f) => functionToCloudInput(f, "dist")),
    );

    const result = await cloudAdapter.deploy(
        cloudInputs,
        projectConfiguration,
        { stage: options.stage },
        ["nestjs"],
    );

    return result;
}
