import fs, { existsSync, readFileSync } from "fs";
import { GenezioDeployOptions } from "../../models/commandOptions.js";
import { YamlConfigurationIOController } from "../../yamlProjectConfiguration/v2.js";
import { YamlProjectConfiguration } from "../../yamlProjectConfiguration/v2.js";
import inquirer from "inquirer";
import path from "path";
import { regions } from "../../utils/configs.js";
import { checkProjectName } from "../create/create.js";
import { log } from "../../utils/logging.js";
import { $ } from "execa";
import { UserError } from "../../errors.js";

export async function nextJsDeploy(options: GenezioDeployOptions) {
    await writeOpenNextConfig();
    await $({ stdio: "inherit" })`npx --yes open-next@^3 build`.catch(() => {
        throw new UserError("Failed to build the Next.js project. Check the logs above.");
    });

    const genezioConfig = await readOrAskConfig(options.config);

    log.info(`Read the following configuration: ${JSON.stringify(genezioConfig, null, 2)}`);
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
