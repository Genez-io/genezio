import axios from "./axios.js";
import { getAuthToken } from "../utils/accounts.js";
import { BACKEND_ENDPOINT } from "../constants.js";
import version from "../utils/version.js";
import { EnvironmentVariable } from "../models/environmentVariables.js";
import { GENEZIO_NOT_AUTH_ERROR_MSG, UserError } from "../errors.js";

export async function setEnvironmentVariables(
    projectId: string,
    projectEnvId: string,
    environmentVariablesData: EnvironmentVariable[],
) {
    // validate parameters
    if (!projectId) {
        throw new UserError("Missing required parameters");
    }

    // Check if user is authenticated
    const authToken = await getAuthToken();
    if (!authToken) {
        throw new UserError(GENEZIO_NOT_AUTH_ERROR_MSG);
    }

    const data = JSON.stringify({
        environmentVariables: environmentVariablesData,
    });

    await axios({
        method: "POST",
        url: `${BACKEND_ENDPOINT}/projects/${projectId}/${projectEnvId}/environment-variables`,
        data: data,
        headers: {
            Authorization: `Bearer ${authToken}`,
            "Accept-Version": `genezio-cli/${version}`,
        },
    });
}
