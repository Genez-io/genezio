import axios from "./axios.js";
import { getAuthToken } from "../utils/accounts.js";
import { BACKEND_ENDPOINT } from "../constants.js";
import version from "../utils/version.js";
import { ProjectDetails, StatusOk } from "./models.js";
import { AxiosResponse } from "axios";
import { GENEZIO_NOT_AUTH_ERROR_MSG, UserError } from "../errors.js";

export default async function getProjectInfoByName(projectName: string): Promise<ProjectDetails> {
    const authToken = await getAuthToken();
    if (!authToken) {
        throw new UserError(GENEZIO_NOT_AUTH_ERROR_MSG);
    }

    const response: AxiosResponse<StatusOk<{ project: ProjectDetails }>> = await axios({
        method: "GET",
        url: `${BACKEND_ENDPOINT}/projects/name/${projectName}`,
        headers: {
            Authorization: `Bearer ${authToken}`,
            "Accept-Version": `genezio-cli/${version}`,
        },
    });
    return response.data.project;
}

export async function getProjectInfoByNameIfExits(projectName: string) {
    let projectInfo;
    try {
        projectInfo = await getProjectInfoByName(projectName);
    } catch (e) {
        /* empty */
    }

    return projectInfo;
}

export async function getProjectEnvFromProjectByName(projectName: string, stageName: string) {
    let completeProjectInfo;
    try {
        completeProjectInfo = await getProjectInfoByName(projectName);
    } catch (e) {
        /* empty */
    }

    if (completeProjectInfo != undefined) {
        const projectEnv = completeProjectInfo.projectEnvs.find(
            (projectEnv) => projectEnv.name == stageName,
        );
        if (!projectEnv) {
            throw new UserError(
                `Stage ${stageName} not found in project ${projectName}. Please run 'genezio deploy --stage ${stageName}' to deploy your project to a new stage.`,
            );
        }

        return projectEnv;
    }
    return undefined;
}
