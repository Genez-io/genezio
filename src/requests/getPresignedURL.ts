import axios from "./axios.js";
import { getAuthToken } from "../utils/accounts.js";
import { BACKEND_ENDPOINT } from "../constants.js";
import version from "../utils/version.js";
import { AxiosResponse } from "axios";
import { StatusOk } from "./models.js";
import { GENEZIO_NOT_AUTH_ERROR_MSG, UserError } from "../errors.js";

export async function getPresignedURL(
    region = "us-east-1",
    archiveName = "genezioDeploy.zip",
    projectName: string,
    deployUnitName: string,
) {
    if (!region || !archiveName || !projectName || !deployUnitName) {
        throw new UserError("Missing required parameters");
    }

    // Check if user is authenticated
    const authToken = await getAuthToken();
    if (!authToken) {
        throw new UserError(GENEZIO_NOT_AUTH_ERROR_MSG);
    }

    const json = JSON.stringify({
        projectName: projectName,
        className: deployUnitName, // we keep className for backward compatibility
        filename: archiveName,
        region: region,
    });

    const response: AxiosResponse<StatusOk<{ presignedURL: string | undefined }>> = await axios({
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

    return response.data.presignedURL;
}
