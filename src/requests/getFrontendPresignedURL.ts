import axios from "./axios.js";
import { getAuthToken } from "../utils/accounts.js";
import { BACKEND_ENDPOINT } from "../constants.js";
import { GENEZIO_NOT_AUTH_ERROR_MSG } from "../errors.js";
import { AxiosError } from "axios";
import version from "../utils/version.js";

export async function getFrontendPresignedURL(
    subdomain: string,
    projectName: string,
    stage: string,
) {
    const region = "us-east-1";
    if (!subdomain || !projectName) {
        throw new Error("Missing required parameters");
    }

    // Check if user is authenticated
    const authToken = await getAuthToken();
    if (!authToken) {
        throw new Error(GENEZIO_NOT_AUTH_ERROR_MSG);
    }

    const json = JSON.stringify({
        subdomainName: subdomain,
        projectName: projectName,
        region: region,
        stage: stage,
    });

    const response: any = await axios({
        method: "GET",
        url: `${BACKEND_ENDPOINT}/core/frontend-deployment-url`,
        data: json,
        headers: {
            Authorization: `Bearer ${authToken}`,
            "Accept-Version": `genezio-cli/${version}`,
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
    }).catch((error: AxiosError) => {
        throw new Error((error.response?.data as any).error.message);
    });

    if (response.data.status === "error") {
        throw new Error(response.data.message);
    }

    if (response.data?.error?.message) {
        throw new Error(response.data.error.message);
    }

    return response.data;
}
