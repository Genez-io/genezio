import { UserError } from "../errors.js";
import { GenezioEnvOptions } from "../models/commandOptions.js";
import { revealEnvironmentVariablesRequest } from "../requests/getEnvironmentVariables.js";
import getProjectInfoByName from "../requests/getProjectInfoByName.js";
import { log } from "../utils/logging.js";
import { writeToFile } from "../utils/file.js";

export async function revealEnvironmentVariables(options: GenezioEnvOptions) {
    const projectName = options.projectName;
    const outputPath = options.output;
    const stage = options.stage || "prod";
    if (!outputPath) {
        throw new UserError("Please provide the output path.");
    }

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

    let content = "";
    if (options.format === "json") {
        content = JSON.stringify(envVarList, null, 2);
    } else {
        content = envVarList.map((envVar) => `${envVar.name}=${envVar.value}`).join("\n");
    }

    try {
        await writeToFile(".", outputPath, content, true);
    } catch (error) {
        log.error("Failed to write to file", error);
        throw new UserError(`Failed to write to file ${outputPath} with error: ${error}.`);
    }

    return;
}
