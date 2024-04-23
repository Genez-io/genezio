import { doAdaptiveLogAction } from "../utils/logging.js";
import { GENEZIO_NOT_AUTH_ERROR_MSG, GENEZIO_PLEASE_REPORT_ISSUE, UserError } from "../errors.js";
import listProjects from "../requests/listProjects.js";
import { getAuthToken } from "../utils/accounts.js";
import { GenezioDeleteOptions } from "../models/commandOptions.js";
import inquirer from "inquirer";
import { ProjectListElement } from "../requests/models.js";
import deleteProject from "../requests/deleteProject.js";
import deleteStage from "../requests/deleteStage.js";
import { log } from "../utils/logging.js";

enum DeleteAction {
    PROJECT = "project",
    STAGE = "stage",
    CANCEL = "cancel",
}

type DeleteOptions =
    | {
          action: DeleteAction.CANCEL;
      }
    | {
          action: DeleteAction.PROJECT;
          project: { id: string; name?: string };
      }
    | {
          action: DeleteAction.STAGE;
          project: { id: string; name?: string };
          stageName: string;
      };

export async function deleteCommand(projectId: string | undefined, options: GenezioDeleteOptions) {
    // check if user is logged in
    const authToken = await getAuthToken();
    if (!authToken) {
        throw new UserError(GENEZIO_NOT_AUTH_ERROR_MSG);
    }

    const deleteOptions = await askDeleteOptions(projectId, options);

    await handleDelete(deleteOptions).catch((err: Error) => {
        throw new UserError(`${deleteOprionsToFailMessage(deleteOptions)}: ${err.message}`);
    });
}

async function handleDelete(deleteOptions: DeleteOptions) {
    switch (deleteOptions.action) {
        case DeleteAction.PROJECT:
            await deleteProject(deleteOptions.project.id);
            log.info(
                deleteOptions.project.name
                    ? `Project ${deleteOptions.project.name} (${deleteOptions.project.id}) has been deleted.`
                    : `Project ${deleteOptions.project.id} has been deleted.`,
            );
            return;
        case DeleteAction.STAGE:
            await deleteStage(deleteOptions.project.id, deleteOptions.stageName);
            log.info(
                deleteOptions.project.name
                    ? `Stage ${deleteOptions.stageName} of project ${deleteOptions.project.name} (${deleteOptions.project.id}) has been deleted.`
                    : `Stage ${deleteOptions.stageName} of project ${deleteOptions.project.id} has been deleted.`,
            );
            return;
        case DeleteAction.CANCEL:
            log.info("Delete action cancelled.");
            return;
        default:
            throw new UserError(GENEZIO_PLEASE_REPORT_ISSUE);
    }
}

async function askDeleteOptions(
    projectId: string | undefined,
    options: GenezioDeleteOptions,
): Promise<DeleteOptions> {
    let result: DeleteOptions = { action: DeleteAction.CANCEL };
    // If user simply runs `genezio delete`
    if (!projectId) {
        let action: DeleteAction.PROJECT | DeleteAction.STAGE = DeleteAction.STAGE;
        if (!options.stage) {
            ({ action } = await inquirer.prompt([
                {
                    type: "list",
                    name: "action",
                    message: "What would you like to delete?",
                    choices: [
                        { name: "Entire project", value: DeleteAction.PROJECT },
                        { name: "Only one stage", value: DeleteAction.STAGE },
                    ],
                },
            ]));
        }

        const projectList = await doAdaptiveLogAction(
            "Fetching deployed projects list",
            listProjects,
        );

        const { selectedProject }: { selectedProject: ProjectListElement } = await inquirer.prompt([
            {
                type: "list",
                name: "selectedProject",
                message: "Select a project to delete:",
                choices: projectList.map((project) => ({
                    name: `${project.name} (${project.region})`,
                    value: project,
                })),
            },
        ]);

        if (action === DeleteAction.STAGE) {
            let selectedStage: string = "";
            if (!options.stage) {
                ({ stage: selectedStage } = await inquirer.prompt([
                    {
                        type: "list",
                        name: "stage",
                        message: "Select a stage to delete:",
                        choices: selectedProject.projectEnvs.map((env) => ({
                            name: env.name,
                            value: env.name,
                        })),
                    },
                ]));
            } else {
                const stageExists = selectedProject.projectEnvs.find(
                    (env) => env.name === options.stage,
                );

                if (!stageExists) {
                    throw new UserError(
                        `Stage ${options.stage} does not exist in project ${selectedProject.name} (${selectedProject.id}).`,
                    );
                }
            }

            result = {
                action,
                project: selectedProject,
                stageName: options.stage || selectedStage,
            };
        } else {
            result = {
                action,
                project: selectedProject,
            };
        }
    } else {
        // If user runs `genezio delete <projectId> [--stage <stageName>]`
        result = options.stage
            ? {
                  action: DeleteAction.STAGE,
                  project: { id: projectId },
                  stageName: options.stage,
              }
            : {
                  action: DeleteAction.PROJECT,
                  project: { id: projectId },
              };
    }

    if (!options.force) {
        const { confirmDelete }: { confirmDelete: boolean } = await inquirer.prompt([
            {
                type: "confirm",
                name: "confirmDelete",
                message: deleteOptionsToWarningQuestion(result),
                default: false,
            },
        ]);

        if (!confirmDelete) {
            return { action: DeleteAction.CANCEL };
        }
    }

    return result;
}

function deleteOptionsToWarningQuestion(options: DeleteOptions): string {
    switch (options.action) {
        case DeleteAction.PROJECT:
            if (options.project.name) {
                return `Are you sure you want to delete project ${options.project.name} (${options.project.id})?`;
            }
            return `Are you sure you want to delete project ${options.project.id}?`;
        case DeleteAction.STAGE:
            if (options.project.name) {
                return `Are you sure you want to delete stage ${options.stageName} from project ${options.project.name} (${options.project.id})?`;
            }
            return `Are you sure you want to delete stage ${options.stageName} from project ${options.project.id}?`;
        default:
            throw new Error(GENEZIO_PLEASE_REPORT_ISSUE);
    }
}

function deleteOprionsToFailMessage(options: DeleteOptions): string {
    switch (options.action) {
        case DeleteAction.PROJECT:
            if (options.project.name) {
                return `Failed to delete project ${options.project.name} (${options.project.id})`;
            }
            return `Failed to delete project ${options.project.id}`;
        case DeleteAction.STAGE:
            if (options.project.name) {
                return `Failed to delete stage ${options.stageName} from project ${options.project.name} (${options.project.id})`;
            }
            return `Failed to delete stage ${options.stageName} from project ${options.project.id}`;
        default:
            throw new Error(GENEZIO_PLEASE_REPORT_ISSUE);
    }
}
