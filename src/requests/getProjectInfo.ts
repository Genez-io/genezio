import axios from "./axios.js";
import { getAuthToken } from "../utils/accounts.js";
import { BACKEND_ENDPOINT } from "../constants.js";
import version from "../utils/version.js";
import { ProjectDetails, Status } from "./models.js";
import { AxiosResponse } from "axios";

export default async function getProjectInfo(projectId: string): Promise<ProjectDetails> {
    const authToken = await getAuthToken();

    if (!authToken) {
        throw new Error(
            "You are not logged in. Run 'genezio login' before you deploy your function.",
        );
    }

    const response: AxiosResponse<Status<{ project: ProjectDetails }>> = await axios({
        method: "GET",
        url: `${BACKEND_ENDPOINT}/projects/${projectId}`,
        headers: {
            Authorization: `Bearer ${authToken}`,
            "Accept-Version": `genezio-cli/${version}`,
        },
    });

    if (response.data.status === "error") {
        throw new Error(response.data.error.message);
    }

    return response.data.project;
}

export async function getProjectEnvFromProject(projectId: string, stageName: string) {
    const completeProjectInfo = await getProjectInfo(projectId);
    const projectEnv = completeProjectInfo.projectEnvs.find(
        (projectEnv) => projectEnv.name == stageName,
    );

    return projectEnv;
}
