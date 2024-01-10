import { AxiosError } from "axios";
import { Spinner } from "cli-spinner";
import log from "loglevel";
import { GENEZIO_NOT_AUTH_ERROR_MSG } from "../errors.js";
import listProjects from "../requests/listProjects.js";
import { GenezioTelemetry, TelemetryEventTypes } from "../telemetry/telemetry.js";
import { GenezioListOptions } from "../models/commandOptions.js";
import { debugLogger } from "../utils/logging.js";
import { isLoggedIn } from "../utils/accounts.js";
import { loginCommand } from "./login.js";

export async function lsCommand(identifier: string, options: GenezioListOptions) {
    await GenezioTelemetry.sendEvent({
        eventType: TelemetryEventTypes.GENEZIO_LS,
        commandOptions: JSON.stringify(options),
    });

    // check if user is logged in
    if (!(await isLoggedIn())) {
        debugLogger.debug("No auth token found. Starting automatic authentication...");
        await loginCommand("", false);
    }

    await lsHandler(identifier, options.longListed).catch((error: AxiosError) => {
        if (error.response?.status === 401) {
            throw new Error(GENEZIO_NOT_AUTH_ERROR_MSG);
        }
        throw error;
    });
}

async function lsHandler(identifier: string, l: boolean) {
    // show prompt if no project id is selected
    const spinner = new Spinner("%s  ");
    spinner.setSpinnerString("|/-\\");
    spinner.start();
    let projectsJson = await listProjects();
    spinner.stop();
    log.info("");
    if (projectsJson.length == 0) {
        log.info("There are no currently deployed projects.");
        return;
    }
    if (identifier.trim().length !== 0) {
        projectsJson = projectsJson.filter(
            (project) => project.name === identifier || project.id === identifier,
        );
        if (projectsJson.length == 0) {
            log.info("There is no project with this identifier.");
            return;
        }
    }
    projectsJson.forEach(function (project, index: number) {
        const createdAt = new Date(project.createdAt * 1000).toISOString();
        const updatedAt = new Date(project.updatedAt * 1000).toISOString();
        if (l) {
            log.info(
                `[${1 + index}]: Project name: ${project.name},\n\tRegion: ${
                    project.region
                },\n\tID: ${project.id},\n\tCreated: ${createdAt},\n\tUpdated: ${updatedAt}`,
            );
        } else {
            log.info(
                `[${1 + index}]: Project name: ${project.name}, Region: ${
                    project.region
                }, Updated: ${updatedAt}`,
            );
        }
    });
}
