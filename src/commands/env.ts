import { UserError } from "../errors.js";
import { GenezioEnvOptions } from "../models/commandOptions.js";
import { revealEnvironmentVariablesRequest } from "../requests/getEnvironmentVariables.js";
import getProjectInfoByName from "../requests/getProjectInfoByName.js";
import { log } from "../utils/logging.js";

export async function revealEnvironmentVariables(options: GenezioEnvOptions) {
    const projectName = options.projectName;
    const stage = options.stage || "prod";
    if (!projectName) {
        throw new UserError("Please provide the project name.");
    }

    const project = await getProjectInfoByName(projectName).catch((error) => {
        throw new UserError(`Failed to retrieve the project ${projectName} with error: ${error}.`);
    });

    const environment = project.projectEnvs.find((env) => env.name == stage);
    if (!environment) {
        throw new UserError(`Stage ${stage} not found in project ${projectName}.`);
    }

    const envVarList = await revealEnvironmentVariablesRequest(project.id, environment.id);

    if (options.format == "json") {
        log.info(JSON.stringify(envVarList));
        return;
    }

    for (const envVar of envVarList) {
        log.info(`${envVar.name}=${envVar.value}`);
    }
    return;
}
