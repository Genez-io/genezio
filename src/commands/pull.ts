import inquirer from "inquirer";
import { interruptLocalProcesses } from "../utils/localInterrupt.js";
import { doAdaptiveLogAction, log } from "../utils/logging.js";
import { YamlConfigurationIOController } from "../projectConfiguration/yaml/v2.js";
import { exit } from "process";
import { askCloneOptions, cloneCommand } from "./clone.js";

export async function pullCommand(stage: string) {
    await interruptLocalProcesses();

    const configIOController = new YamlConfigurationIOController("./genezio.yaml", {
        stage: stage,
    });
    const configuration = await configIOController.read();

    const { confirmPull }: { confirmPull: boolean } = await inquirer.prompt([
        {
            type: "confirm",
            name: "confirmPull",
            message: `Are you sure you want to pull the latest changes from the cloud? All local changes will be lost.`,
            default: false,
        },
    ]);

    if (!confirmPull) {
        log.info("Pull operation cancelled.");
        exit(0);
    }

    const options = await askCloneOptions({
        name: configuration.name,
        region: configuration.region,
        stage: stage,
    });

    await doAdaptiveLogAction("Pulling the latest changes from the cloud...", async () =>
        cloneCommand(options.name, options.region, options.stage, "."),
    );
}
