import { AxiosError } from "axios";
import { Spinner } from "cli-spinner";
import log from "loglevel";
import { GENEZIO_NOT_AUTH_ERROR_MSG } from "../errors.js";
import deleteProject from "../requests/deleteProject.js";
import listProjects from "../requests/listProjects.js";
import { getAuthToken } from "../utils/accounts.js";
import { askQuestion } from "../utils/prompt.js";
import { GenezioDeleteOptions } from "../models/commandOptions.js";

export async function deleteCommand(projectId: string, options: GenezioDeleteOptions) {
    // check if user is logged in
    const authToken = await getAuthToken();
    if (!authToken) {
        throw new Error(GENEZIO_NOT_AUTH_ERROR_MSG);
    }

    const result = await deleteProjectHandler(projectId, options.force).catch(
        (error: AxiosError) => {
            if (error.response?.status == 401) {
                throw new Error(GENEZIO_NOT_AUTH_ERROR_MSG);
            }
            throw error;
        },
    );

    if (result) {
        log.info("Your project has been deleted");
    } else {
        log.info("Your project has not been deleted. Please try again later.");
    }
}

async function deleteProjectHandler(projectId: string, forced: boolean): Promise<boolean> {
    // show prompt if no project id is selected
    if (typeof projectId === "string" && projectId.trim().length === 0) {
        const spinner = new Spinner("%s  ");
        spinner.setSpinnerString("|/-\\");
        spinner.start();
        const projectsJson = await listProjects();

        spinner.stop();
        // hack to add a newline  after the spinner
        log.info("");

        const projects = projectsJson.map(function (project: any, index: number) {
            return `[${1 + index}]: Project name: ${project.name}, Region: ${project.region}, ID: ${
                project.id
            }`;
        });

        if (projects.length === 0) {
            log.info("There are no currently deployed projects.");
            return false;
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
            return false;
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
            return false;
        }
    }

    const status = await deleteProject(projectId);

    return status;
}
