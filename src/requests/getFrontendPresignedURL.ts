import axios from "axios";
import { getAuthToken } from "../utils/accounts";
import { GENEZIO_NOT_AUTH_ERROR_MSG } from "../utils/strings";
import { BACKEND_ENDPOINT } from "../variables";

export async function getFrontendPresignedURL (
    subdomain: string,
    projectName: string
) {
    const region = "us-east-1";
    if (!subdomain || !projectName) {
        throw new Error("Missing required parameters");
    }

    // Check if user is authenticated
    const authToken = await getAuthToken()
    if (!authToken) {
        throw new Error(GENEZIO_NOT_AUTH_ERROR_MSG);
    }

    const json = JSON.stringify({
        subdomainName: subdomain,
        projectName: projectName,
        region:  region,
    });

    const response: any = await axios({
        method: "GET",
        url: `${BACKEND_ENDPOINT}/core/frontend-deployment-url`, 
        data: json,
        headers: {Authorization: `Bearer ${authToken}` },
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      })
    
    if (response.data.status === "error") {
        throw new Error(response.data.message);
    }

    if (response.data?.error?.message) {
        throw new Error(response.data.error.message);
    }

    return response.data;
}
