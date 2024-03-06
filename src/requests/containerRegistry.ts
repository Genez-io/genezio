import axios from "./axios.js";
import { getAuthToken } from "../utils/accounts.js";
import { BACKEND_ENDPOINT } from "../constants.js";
import version from "../utils/version.js";
import { AxiosResponse } from "axios";

interface ContainerRegistry {
    status: string;
    username: string;
    repository: string;
}

interface ContainerRegistryCreds {
    status: string;
    password: string;
}

export async function getContainerRegistry() {
    // Check if user is authenticated
    const authToken = await getAuthToken();
    if (!authToken) {
        throw new Error(
            "You are not logged in. Run 'genezio login' before you deploy your function.",
        );
    }

    const response: AxiosResponse<ContainerRegistry> = await axios({
        method: "GET",
        url: `${BACKEND_ENDPOINT}/core/container-registry`,
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

export async function getContainerRegistryCredentials() {
    const authToken = await getAuthToken();
    if (!authToken) {
        throw new Error(
            "You are not logged in. Run 'genezio login' before you deploy your function.",
        );
    }

    const response: AxiosResponse<ContainerRegistryCreds> = await axios({
        method: "GET",
        url: `${BACKEND_ENDPOINT}/users/harbor/credentials`,
        headers: {
            Authorization: `Bearer ${authToken}`,
            "Accept-Version": `genezio-cli/${version}`,
        },
    }).catch((error: Error) => {
        throw error;
    });

    if (!(response.status >= 200 && response.status < 300)) {
        throw new Error(response.statusText || "Unknown error occurred.");
    }

    return response.data;
}
