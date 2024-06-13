import axios, { AxiosResponse } from "axios";
import { BACKEND_ENDPOINT } from "../constants.js";
import { getAuthToken } from "../utils/accounts.js";
import { GENEZIO_NOT_AUTH_ERROR_MSG, UserError } from "../errors.js";
import version from "../utils/version.js";
import { StatusOk } from "./models.js";

export interface FrontendStatus {
    frontendDeploymentStatus: "Deployed" | "InProgress";
}

export async function getFrontendStatus(subdomain: string) {
    // Check if user is authenticated
    const authToken = await getAuthToken();
    if (!authToken) {
        throw new UserError(GENEZIO_NOT_AUTH_ERROR_MSG);
    }

    const response: AxiosResponse<StatusOk<FrontendStatus>> = await axios({
        method: "GET",
        url: `${BACKEND_ENDPOINT}/v2/frontend-status?subdomain=${subdomain}`,
        headers: {
            Authorization: `Bearer ${authToken}`,
            "Accept-Version": `genezio-cli/${version}`,
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
    });

    return response.data.frontendDeploymentStatus;
}
