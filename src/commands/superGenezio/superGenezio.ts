import path from "path";
import { getAuthToken } from "../../utils/accounts.js";
import { fileExists } from "../../utils/file.js";
import { loginCommand } from "../login.js";
import { debugLogger } from "../../utils/logging.js";
import { deployCommand } from "../deploy.js";
import colors from "colors";
import inquirer from "inquirer";
import { exit } from "process";
import { GenezioTelemetry, TelemetryEventTypes } from "../../telemetry/telemetry.js";
import { startLocalEnvironment } from "../local.js";
import { PORT_LOCAL_ENVIRONMENT } from "../../constants.js";
import { GenezioDeployOptions, GenezioLocalOptions } from "../../models/commandOptions.js";
import { createNewProject } from "./createNewProject.js";

export async function genezioCommand() {
    if (await fileExists(path.join(process.cwd(), "genezio.yaml"))) {
        const answer: { command: "deploy" | "local" | "cancel" } = await inquirer.prompt([
            {
                type: "list",
                name: "command",
                message: colors.magenta("Genezio project detected. What would you like to do?"),
                choices: [
                    {
                        name: "Deploy your project (genezio deploy)",
                        value: "deploy",
                    },
                    {
                        name: "Start a Local server (genezio local)",
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
                };

                if (!(await getAuthToken())) {
                    debugLogger.debug("No auth token found. Starting automatic authentication...");
                    await loginCommand("", false);
                }

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
                };

                return await startLocalEnvironment(options).catch(async (error) => {
                    await GenezioTelemetry.sendEvent({
                        eventType: TelemetryEventTypes.GENEZIO_LOCAL_ERROR,
                        errorTrace: error.message,
                        commandOptions: JSON.stringify(options),
                    });
                    exit(1);
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
                    "Genezio project could not be detected. What would you like to do?",
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
                return await createNewProject();
            }
            case "cancel":
            default:
                break;
        }
    }
}
