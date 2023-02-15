import axios from "./axios";
import { getAuthToken } from "../utils/accounts";
import { BACKEND_ENDPOINT } from "../variables";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pjson = require("../../package.json");

export async function getPresignedURL (
    region = "us-east-1",
    archiveName = "genezioDeploy.zip",
    projectName: string,
    className: string,
) {
    if (!region || !archiveName || !projectName || !className) {
        throw new Error("Missing required parameters");
    }

    // Check if user is authenticated
    const authToken = await getAuthToken()
    if (!authToken) {
        throw new Error(
            "You are not logged in. Run 'genezio login' before you deploy your function."
        );
    }

    const json = JSON.stringify({
        projectName: projectName,
        className: className,
        filename: archiveName,
        region : region,
    });

    const response: any = await axios({
        method: "GET",
        url: `${BACKEND_ENDPOINT}/core/deployment-url`,
        data: json,
        headers: {
            Authorization: `Bearer ${authToken}`,
            "Accept-Version": `genezio-cli/${pjson.version}`
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      }).catch((error: Error) => {
        throw error;
      });

    if (response.data.status === "error") {
        throw new Error(response.data.message);
    }

    if (response.data?.error?.message) {
        throw new Error(response.data.error.message);
    }

    return response.data;
}
