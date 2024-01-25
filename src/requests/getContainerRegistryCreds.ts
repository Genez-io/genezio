import axios from "./axios.js";
import { getAuthToken } from "../utils/accounts.js";
import { BACKEND_ENDPOINT } from "../constants.js";
import version from "../utils/version.js";
import { AxiosResponse } from "axios";

interface ContainerRegistryCreds {
    status: string;
    username: string;
    password: string;
    repository: string;
    tag: string;
}

export async function getContainerRegistryCreds(projectName: string, className: string) {
    if (!projectName || !className) {
        throw new Error("Missing required parameters");
    }

    // Check if user is authenticated
    const authToken = await getAuthToken();
    if (!authToken) {
        throw new Error(
            "You are not logged in. Run 'genezio login' before you deploy your function.",
        );
    }

    const json = JSON.stringify({
        projectName: projectName,
        className: className,
    });

    const response: AxiosResponse<ContainerRegistryCreds> = await axios({
        method: "GET",
        url: `${BACKEND_ENDPOINT}/core/cluster-credentials`,
        data: json,
        headers: {
            Authorization: `Bearer ${authToken}`,
            "Accept-Version": `genezio-cli/${version}`,
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
    }).catch((error: Error) => {
        throw error;
    });

    if (!(response.status >= 200 && response.status < 300)) {
        throw new Error(response.statusText || "Unknown error occurred.");
    }

    return response.data;
}
