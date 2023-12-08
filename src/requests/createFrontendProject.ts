import axios from "./axios.js";
import { getAuthToken } from "../utils/accounts.js";
import { GENEZIO_NOT_AUTH_ERROR_MSG } from "../errors.js";
import { BACKEND_ENDPOINT } from "../constants.js";
import version from "../utils/version.js";
import { AxiosResponse } from "axios";
import { Status } from "./models.js";

export async function createFrontendProject(
    genezioDomain: string,
    projectName: string,
    region: string,
    stage: string,
) {
    // Check if user is authenticated
    const authToken = await getAuthToken();
    if (!authToken) {
        throw new Error(GENEZIO_NOT_AUTH_ERROR_MSG);
    }

    const json = JSON.stringify({
        genezioDomain,
        projectName,
        region,
        stage,
    });

    const response: AxiosResponse<Status> = await axios({
        method: "PUT",
        url: `${BACKEND_ENDPOINT}/frontend`,
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
}
