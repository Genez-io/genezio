import axios from "./axios.js";
import { getAuthToken } from "../utils/accounts.js";
import { BACKEND_ENDPOINT } from "../constants.js";
import { GENEZIO_NOT_AUTH_ERROR_MSG, UserError } from "../errors.js";
import { AxiosResponse } from "axios";
import version from "../utils/version.js";
import { StatusOk } from "./models.js";

export async function getFrontendPresignedURL(
    subdomain: string,
    projectName: string,
    stage: string,
) {
    const region = "us-east-1";
    if (!subdomain || !projectName) {
        throw new UserError("Missing required parameters");
    }

    // Check if user is authenticated
    const authToken = await getAuthToken();
    if (!authToken) {
        throw new UserError(GENEZIO_NOT_AUTH_ERROR_MSG);
    }

    const json = JSON.stringify({
        subdomainName: subdomain,
        projectName: projectName,
        region: region,
        stage: stage,
    });

    const response: AxiosResponse<StatusOk<{ userId: string; presignedURL: string }>> = await axios(
        {
            method: "GET",
            url: `${BACKEND_ENDPOINT}/core/frontend-deployment-url`,
            data: json,
            headers: {
                Authorization: `Bearer ${authToken}`,
                "Accept-Version": `genezio-cli/${version}`,
            },
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
        },
    );

    return response.data;
}
