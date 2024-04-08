import path from "path";
import { fileExists } from "../utils/file.js";
import { deployCommand } from "./deploy.js";
import colors from "colors";
import inquirer from "inquirer";
import { GenezioTelemetry, TelemetryEventTypes } from "../telemetry/telemetry.js";
import { startLocalEnvironment } from "./local.js";
import { PORT_LOCAL_ENVIRONMENT } from "../constants.js";
import {
    GenezioCreateOptions,
    GenezioDeployOptions,
    GenezioLocalOptions,
} from "../models/commandOptions.js";
import { askCreateOptions } from "./create/interactive.js";
import { log } from "../utils/logging.js";
import currentGenezioVersion from "../utils/version.js";
import { createCommand } from "./create/create.js";

export async function genezioCommand() {
    log.info(`genezio v${currentGenezioVersion}. Run with \`--help\` to display CLI options.`);

    if (await fileExists(path.join(process.cwd(), "genezio.yaml"))) {
        const answer: { command: "deploy" | "local" | "cancel" } = await inquirer.prompt([
            {
                type: "list",
                name: "command",
                message: colors.magenta("Genezio project detected. What would you like to do?"),
                choices: [
                    {
                        name: "Deploy your genezio project (genezio deploy)",
                        value: "deploy",
                    },
                    {
                        name: "Start the genezio backend locally (genezio local)",
                        value: "local",
                    },
                    {
                        name: "Cancel operation",
                        value: "cancel",
                    },
                ],
            },
        ]);

        switch (answer.command) {
            case "deploy": {
                process.env["CURRENT_COMMAND"] = "deploy";
                const options: GenezioDeployOptions = {
                    installDeps: true,
                    config: "./genezio.yaml",
                    stage: "prod",
                    backend: false,
                    frontend: false,
                };

                return await deployCommand(options).catch(async (error) => {
                    await GenezioTelemetry.sendEvent({
                        eventType: TelemetryEventTypes.GENEZIO_DEPLOY_ERROR,
                        errorTrace: error.message,
                        commandOptions: JSON.stringify(options),
                    });
                    throw error;
                });
            }
            case "local": {
                process.env["CURRENT_COMMAND"] = "local";
                const options: GenezioLocalOptions = {
                    port: PORT_LOCAL_ENVIRONMENT,
                    installDeps: true,
                    config: "./genezio.yaml",
                    stage: "prod",
                };

                return await startLocalEnvironment(options).catch(async (error) => {
                    await GenezioTelemetry.sendEvent({
                        eventType: TelemetryEventTypes.GENEZIO_LOCAL_ERROR,
                        errorTrace: error.message,
                        commandOptions: JSON.stringify(options),
                    });
                    throw error;
                });
            }
            case "cancel":
            default:
                break;
        }
    } else {
        const answer: { command: "createTemplate" | "cancel" } = await inquirer.prompt([
            {
                type: "list",
                name: "command",
                message: colors.magenta(
                    "No genezio project in the current folder. What would you like to do?",
                ),
                choices: [
                    {
                        name: "Create a new project from a template",
                        value: "createTemplate",
                    },
                    {
                        name: "Cancel operation",
                        value: "cancel",
                    },
                ],
            },
        ]);

        switch (answer.command) {
            case "createTemplate": {
                const options: GenezioCreateOptions = await askCreateOptions();

                const telemetryEvent = GenezioTelemetry.sendEvent({
                    eventType: TelemetryEventTypes.GENEZIO_CREATE_INTERACTIVE,
                    commandOptions: JSON.stringify(options),
                });

                await createCommand(options).catch(async (error) => {
                    await telemetryEvent;
                    await GenezioTelemetry.sendEvent({
                        eventType: TelemetryEventTypes.GENEZIO_CREATE_INTERACTIVE_ERROR,
                        errorTrace: error.message,
                        commandOptions: JSON.stringify(options),
                    });
                    throw error;
                });
                await telemetryEvent;

                break;
            }
            case "cancel":
            default:
                break;
        }
    }
}
