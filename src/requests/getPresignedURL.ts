import axios from "./axios.js";
import { getAuthToken } from "../utils/accounts.js";
import { BACKEND_ENDPOINT } from "../constants.js";
import version from "../utils/version.js";
import { AxiosResponse } from "axios";
import { Status } from "./models.js";

export async function getPresignedURL(
    region = "us-east-1",
    archiveName = "genezioDeploy.zip",
    projectName: string,
    className: string,
) {
    if (!region || !archiveName || !projectName || !className) {
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
        filename: archiveName,
        region: region,
    });

    const response: AxiosResponse<Status<{ presignedURL: string | undefined }>> = await axios({
        method: "GET",
        url: `${BACKEND_ENDPOINT}/core/deployment-url`,
        data: json,
        headers: {
            Authorization: `Bearer ${authToken}`,
            "Accept-Version": `genezio-cli/${version}`,
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
    });

    if (response.data.status === "error") {
        throw new Error(response.data.error.message);
    }

    return response.data.presignedURL;
}
