import { Spinner } from "cli-spinner";
import { log } from "../utils/logging.js";
import { GENEZIO_NOT_AUTH_ERROR_MSG, UserError } from "../errors.js";
import deleteProject from "../requests/deleteProject.js";
import listProjects from "../requests/listProjects.js";
import { getAuthToken } from "../utils/accounts.js";
import { askQuestion } from "../utils/prompt.js";
import { GenezioDeleteOptions } from "../models/commandOptions.js";
import deleteStage from "../requests/deleteStage.js";

export async function deleteCommand(projectId: string | undefined, options: GenezioDeleteOptions) {
    // check if user is logged in
    const authToken = await getAuthToken();
    if (!authToken) {
        throw new UserError(GENEZIO_NOT_AUTH_ERROR_MSG);
    }

    await deleteProjectHandler(projectId, options.force, options.stage).catch((error) => {
        throw new UserError(
            `Could not delete${options.stage ? " stage " + options.stage + " of" : ""} project ${projectId}: ${error.message}`,
        );
    });
}

async function deleteProjectHandler(
    projectId: string | undefined,
    forced: boolean,
    stage?: string,
): Promise<void> {
    // show prompt if no project id is selected
    if (!projectId) {
        const spinner = new Spinner("%s  ");
        spinner.setSpinnerString("|/-\\");
        spinner.start();
        const projectsJson = await listProjects();

        spinner.stop();
        // hack to add a newline  after the spinner
        log.info("");

        const projects = projectsJson.map(function (project, index: number) {
            return `[${1 + index}]: Project name: ${project.name}, Region: ${project.region}, ID: ${
                project.id
            }`;
        });

        if (projects.length === 0) {
            log.info("There are no currently deployed projects.");
            return;
        } else {
            log.info("No project ID specified, select an ID to delete from this list:");
            log.info(projects);
        }

        const selection = await askQuestion(
            `Please select project number to delete (1--${projects.length}) [none]: `,
            "",
        );
        const selectionNum = Number(selection);
        if (isNaN(selectionNum) || selectionNum <= 0 || selectionNum > projects.length) {
            log.info("No valid selection was made, aborting.");
            return;
        } else {
            forced = false;
            // get the project id from the selection
            projectId = projects[selectionNum - 1].split(":")[4].trim();
        }
    }

    if (!forced) {
        const confirmation = await askQuestion(
            `Are you sure you want to delete project ${projectId}? y/[N]: `,
            "n",
        );

        if (confirmation !== "y" && confirmation !== "Y") {
            log.warn("Aborted operation.");
            return;
        }
    }

    if (stage) {
        await deleteStage(projectId, stage);
        log.info(`Stage ${stage} of project ${projectId} has been deleted`);
    } else {
        await deleteProject(projectId);
        log.info(`Project ${projectId} has been deleted`);
    }
}
