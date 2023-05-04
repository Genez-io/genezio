import axios from "./axios";
import { getAuthToken } from "../utils/accounts";
import { GENEZIO_NOT_AUTH_ERROR_MSG } from "../errors";
import { BACKEND_ENDPOINT } from "../constants";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pjson = require("../../package.json");

export async function createFrontendProject(genezioDomain: string, projectName: string, region: string) {
    // Check if user is authenticated
    const authToken = await getAuthToken()
    if (!authToken) {
        throw new Error(GENEZIO_NOT_AUTH_ERROR_MSG);
    }

    const json = JSON.stringify({
        genezioDomain,
        projectName,
        region
    });

    const response: any = await axios({
        method: "PUT",
        url: `${BACKEND_ENDPOINT}/frontend`,
        data: json,
        headers: {
            Authorization: `Bearer ${authToken}`,
            "Accept-Version": `genezio-cli/${pjson.version}`
        },
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
