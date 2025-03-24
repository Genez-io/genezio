import axios from "./axios.js";
import { getAuthToken } from "../utils/accounts.js";
import { BACKEND_ENDPOINT } from "../constants.js";
import version from "../utils/version.js";
import { AxiosResponse } from "axios";
import { ExposedEnvironmentVariable, ObfuscatedEnvironmentVariable, StatusOk } from "./models.js";
import { GENEZIO_NOT_AUTH_ERROR_MSG, UserError } from "../errors.js";

export async function getEnvironmentVariables(
    projectId: string,
    projectEnvId: string,
): Promise<ObfuscatedEnvironmentVariable[]> {
    // validate parameters
    if (!projectId) {
        throw new UserError("Missing required parameters");
    }

    // Check if user is authenticated
    const authToken = await getAuthToken();
    if (!authToken) {
        throw new UserError(GENEZIO_NOT_AUTH_ERROR_MSG);
    }

    const response: AxiosResponse<
        StatusOk<{ environmentVariables: ObfuscatedEnvironmentVariable[] }>
    > = await axios({
        method: "GET",
        url: `${BACKEND_ENDPOINT}/projects/${projectId}/${projectEnvId}/environment-variables`,
        headers: {
            Authorization: `Bearer ${authToken}`,
            "Accept-Version": `genezio-cli/${version}`,
        },
    });

    return response.data.environmentVariables;
}

export async function revealEnvironmentVariablesRequest(
    projectId: string,
    projectEnvId: string,
): Promise<ExposedEnvironmentVariable[]> {
    // Validate parameters
    if (!projectId || !projectEnvId) {
        throw new UserError("Missing required parameters");
    }

    // Check if user is authenticated
    const authToken = await getAuthToken();
    if (!authToken) {
        throw new UserError(GENEZIO_NOT_AUTH_ERROR_MSG);
    }

    const response: AxiosResponse<
        StatusOk<{ environmentVariables: ExposedEnvironmentVariable[] }>
    > = await axios({
        method: "GET",
        url: `${BACKEND_ENDPOINT}/projects/${projectId}/${projectEnvId}/environment-variables/reveal`,
        headers: {
            Authorization: `Bearer ${authToken}`,
            "Accept-Version": `genezio-cli/${version}`,
        },
    });

    return response.data.environmentVariables;
}
