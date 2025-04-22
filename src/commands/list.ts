import { Spinner } from "cli-spinner";
import { log } from "../utils/logging.js";
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

    await lsHandler(identifier, options.longListed, options.format);
}

async function lsHandler(identifier: string, l: boolean, format: string) {
    const useSpinner = format === "text";

    const spinner = new Spinner("%s  ");
    spinner.setSpinnerString("|/-\\");
    if (useSpinner) {
        spinner.start();
    }
    let projectsJson = await listProjects();

    if (useSpinner) {
        spinner.stop(true);
    }

    if (projectsJson.length == 0 && format == "text") {
        log.info("There are no currently deployed projects.");
        return;
    } else if (projectsJson.length == 0 && format == "json") {
        log.info("[]");
        return;
    }

    if (identifier.trim().length !== 0) {
        projectsJson = projectsJson.filter(
            (project) => project.name === identifier || project.id === identifier,
        );
        if (projectsJson.length == 0 && format == "text") {
            log.info("There is no project with this identifier.");
            return;
        } else if (projectsJson.length == 0 && format == "json") {
            log.info("[]");
            return;
        }
    }
    if (format === "json") {
        if (projectsJson.length == 1) {
            log.info(JSON.stringify(projectsJson[0], null, 0));
            return;
        }
        log.info(JSON.stringify(projectsJson, null, 0));
        return;
    }
    projectsJson.forEach(function (project, index: number) {
        const createdAt = new Date(project.createdAt * 1000).toISOString();
        const updatedAt = new Date(project.updatedAt * 1000).toISOString();
        if (l) {
            log.info(
                `[${1 + index}]: Project name: ${project.name},\n\tRegion: ${
                    project.region
                },\n\tID: ${project.id},\n\tCloud Provider: ${project.cloudProvider}\n\tCreated: ${createdAt},\n\tUpdated: ${updatedAt}`,
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
