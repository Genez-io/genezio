import axios from "./axios.js";
import { getAuthToken } from "../utils/accounts.js";
import { BACKEND_ENDPOINT } from "../constants.js";
import version from "../utils/version.js";
import { ProjectDetails, StatusOk } from "./models.js";
import { AxiosResponse } from "axios";
import { UserError } from "../errors.js";

export default async function getProjectInfoByName(
    projectName: string,
    region: string,
): Promise<ProjectDetails> {
    const authToken = await getAuthToken();

    if (!authToken) {
        throw new UserError(
            "You are not logged in. Run 'genezio login' before you deploy your function.",
        );
    }

    const response: AxiosResponse<StatusOk<{ project: ProjectDetails }>> = await axios({
        method: "GET",
        url: `${BACKEND_ENDPOINT}/projects/name/${projectName}`,
        params: {
            region: region,
        },
        headers: {
            Authorization: `Bearer ${authToken}`,
            "Accept-Version": `genezio-cli/${version}`,
        },
    });
    return response.data.project;
}

export async function getProjectEnvFromProjectByName(
    projectName: string,
    region: string,
    stageName: string,
) {
    let completeProjectInfo;
    try {
        completeProjectInfo = await getProjectInfoByName(projectName, region);
    } catch (e) {}

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
