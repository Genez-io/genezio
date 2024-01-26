import axios from "./axios.js";
import { getAuthToken } from "../utils/accounts.js";
import { BACKEND_ENDPOINT } from "../constants.js";
import version from "../utils/version.js";
import { AxiosResponse } from "axios";
import { StatusOk } from "./models.js";

export async function getCompileDartPresignedURL(archiveName: string) {
    if (!archiveName) {
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
        zipName: archiveName,
    });

    const response: AxiosResponse<StatusOk<{ userId: string; presignedURL: string | undefined }>> =
        await axios({
            method: "GET",
            url: `${BACKEND_ENDPOINT}/core/compile-dart-url`,
            data: json,
            headers: {
                Authorization: `Bearer ${authToken}`,
                "Accept-Version": `genezio-cli/${version}`,
            },
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
        });

    if (response.data.presignedURL === undefined) {
        throw new Error("The endpoint did not return a presigned url.");
    }

    return { ...response.data, presignedURL: response.data.presignedURL };
}
