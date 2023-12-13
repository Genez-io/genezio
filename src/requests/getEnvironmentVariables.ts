import axios from "./axios.js";
import { getAuthToken } from "../utils/accounts.js";
import { BACKEND_ENDPOINT } from "../constants.js";
import version from "../utils/version.js";
import { AxiosResponse } from "axios";
import { ObfuscatedEnvironmentVariable, Status } from "./models.js";

export async function getEnvironmentVariables(
    projectId: string,
    projectEnvId: string,
): Promise<ObfuscatedEnvironmentVariable[]> {
    // validate parameters
    if (!projectId) {
        throw new Error("Missing required parameters");
    }

    // Check if user is authenticated
    const authToken = await getAuthToken();
    if (!authToken) {
        throw new Error(
            "You are not logged in. Run 'genezio login' before you deploy your function.",
        );
    }

    const response: AxiosResponse<
        Status<{ environmentVariables: ObfuscatedEnvironmentVariable[] }>
    > = await axios({
        method: "GET",
        url: `${BACKEND_ENDPOINT}/projects/${projectId}/${projectEnvId}/environment-variables`,
        headers: {
            Authorization: `Bearer ${authToken}`,
            "Accept-Version": `genezio-cli/${version}`,
        },
    });

    if (response.data.status === "error") {
        throw new Error(response.data.error.message);
    }

    return response.data.environmentVariables;
}
