import axios from "./axios.js";
import { getAuthToken } from "../utils/accounts.js";
import { BACKEND_ENDPOINT } from "../constants.js";
import version from "../utils/version.js";
import { AxiosResponse } from "axios";
import { StatusOk } from "./models.js";
import { GENEZIO_NOT_AUTH_ERROR_MSG, UserError } from "../errors.js";

export async function getPresignedURLForProjectCodePull(
    region = "us-east-1",
    projectName: string,
    stage: string,
) {
    if (!region || !projectName) {
        throw new UserError("Missing required parameters");
    }

    // Check if user is authenticated
    const authToken = await getAuthToken();
    if (!authToken) {
        throw new UserError(GENEZIO_NOT_AUTH_ERROR_MSG);
    }

    const json = JSON.stringify({
        projectName: projectName,
        region: region,
        stage: stage,
    });

    const response: AxiosResponse<StatusOk<{ presignedURL: string | undefined }>> = await axios({
        method: "POST",
        url: `${BACKEND_ENDPOINT}/core/get-project-code-url`,
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
