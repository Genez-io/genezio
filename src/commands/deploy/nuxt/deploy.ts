import { $ } from "execa";
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
import { getPackageManager } from "../../../packageManagers/packageManager.js";
import { existsSync } from "fs";
import path from "path";
import colors from "colors";
import semver from "semver";
import fs from "fs";

export async function nuxtDeploy(options: GenezioDeployOptions) {
    // Check if node_modules exists
    if (!existsSync("node_modules")) {
        throw new UserError(
            `Please run \`${getPackageManager().command} install\` before deploying your Nuxt project. This will install the necessary dependencies.`,
        );
    }

    const packageJsonPath = path.join(process.cwd(), "package.json");
    const packageBuffer = fs.readFileSync(packageJsonPath);

    const nuxtConfig = JSON.parse(packageBuffer.toString("utf8"));
    const nuxtVersion = nuxtConfig.devDependencies["nuxt"].slice(1);

    if (semver.lt(nuxtVersion, "3.7.0")) {
        await configureOlderNuxtVersions();
    } else {
        await $({ stdio: "inherit" })`npx nuxi build --preset=aws_lambda`.catch(() => {
            throw new UserError("Failed to build the Nuxt project. Check the logs above.");
        });
    }
    const genezioConfig = await readOrAskConfig(options.config);
    await deployFunctions(genezioConfig, options.stage);
}

async function configureOlderNuxtVersions() {
    const nuxtConfigPath = path.join(process.cwd(), "nuxt.config.ts");
    let nuxtConfigContent = fs.readFileSync(nuxtConfigPath, "utf8");

    //check that preset doesnt exist
    if (!nuxtConfigContent.includes("preset")) {
        const textToInsert = `
    nitro: {
        preset: "aws_lambda",
    },`;

        // Makes sure that the config file is formatted correctly(has a comma at the end of the last object)
        const lastIndexColumn = nuxtConfigContent.lastIndexOf("}");
        const secondToLastIndex = nuxtConfigContent.lastIndexOf("}", lastIndexColumn - 1);
        const lastIndexComma = nuxtConfigContent.lastIndexOf(",");
        const formattedTextToInsert =
            (secondToLastIndex > lastIndexComma ? "," : "") + textToInsert;

        if (lastIndexColumn !== -1) {
            nuxtConfigContent = [
                nuxtConfigContent.slice(0, lastIndexColumn),
                formattedTextToInsert,
                nuxtConfigContent.slice(lastIndexColumn),
            ].join("");
        }

        // Write the updated content back to the file
        fs.writeFileSync(nuxtConfigPath, nuxtConfigContent, "utf8");
    }
    await $({ stdio: "inherit" })`npx nuxi build`.catch(() => {
        throw new UserError("Failed to build the Nuxt project. Check the logs above.");
    });
}
async function deployFunctions(config: YamlProjectConfiguration, stage?: string) {
    const cloudProvider = await getCloudProvider(config.name);
    const cloudAdapter = getCloudAdapter(cloudProvider);

    const functions = [
        {
            path: path.join(".output", "server"),
            name: "nuxt-server",
            entry: "index.mjs",
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

    const result = await cloudAdapter.deploy(cloudInputs, projectConfiguration, { stage }, [
        "nuxt",
    ]);
    debugLogger.debug(`Deployed functions: ${JSON.stringify(result.functions)}`);

    log.info(
        `${colors.cyan("Your Nuxt code was successfully deployed")}
        
Your Nuxt app is available at ${colors.cyan(result.functions[0].cloudUrl)}`,
    );

    return result;
}
