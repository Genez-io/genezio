import inquirer from "inquirer";
import { interruptLocalProcesses } from "../utils/localInterrupt.js";
import { log, printAdaptiveLog } from "../utils/logging.js";
import { YamlConfigurationIOController } from "../yamlProjectConfiguration/v2.js";
import { exit } from "process";
import { cloneCommand } from "./clone.js";

export async function pullCommand(stage: string) {
    await interruptLocalProcesses();

    const configIOController = new YamlConfigurationIOController(".", {
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

    printAdaptiveLog(`Pulling the latest changes from the cloud...`, "start");
    cloneCommand(configuration.name, configuration.region, stage, ".");
}
