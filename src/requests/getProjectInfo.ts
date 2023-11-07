import axios from "./axios.js";
import { getAuthToken } from "../utils/accounts.js";
import { BACKEND_ENDPOINT } from "../constants.js";
import version from "../utils/version.js";
import log from "loglevel";

export default async function getProjectInfo(projectId: string): Promise<any> {
    const authToken = await getAuthToken();

    if (!authToken) {
        throw new Error(
            "You are not logged in. Run 'genezio login' before you deploy your function.",
        );
    }

    const response: any = await axios({
        method: "GET",
        url: `${BACKEND_ENDPOINT}/projects/${projectId}`,
        headers: {
            Authorization: `Bearer ${authToken}`,
            "Accept-Version": `genezio-cli/${version}`,
        },
    }).catch((error: Error) => {
        throw error;
    });

    if (response.data?.error?.message) {
        throw new Error(response.data.error.message);
    }

    if (response.data.status !== "ok") {
        log.error("Unknown error in getting the project info from the server.");
        return null;
    }

    return response.data.project;
}

export async function getProjectEnvFromProject(projectId: string, stageName: string) {
    const completeProjectInfo = await getProjectInfo(projectId);
    const projectEnv = completeProjectInfo.projectEnvs.find(
        (projectEnv: any) => projectEnv.name == stageName,
    );

    return projectEnv;
}
