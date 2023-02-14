import axios from "axios";
import fs from "fs";
import { getAuthToken } from "../utils/accounts";

export async function uploadContentToS3(
    presignedURL: string,
    archivePath: string,
    userId?: string,
) {
    if(!presignedURL) {
        throw new Error("Missing presigned URL");
    }

    if(!archivePath) {
        throw new Error("Missing required parameters");
    }

    // Check if user is authenticated
    const authToken = await getAuthToken()
    if (!authToken) {
        throw new Error(
            "You are not logged in. Run 'genezio login' before you deploy your function."
        );
    }

    const zipToUpload = fs.readFileSync(archivePath)
    const headers: any = {"Content-Type": "application/octet-stream", }

    if (userId) {
        headers["x-amz-meta-userid"] = userId
    }
    
    const response: any = await axios({
        method: "PUT",
        url: presignedURL,
        data: zipToUpload,
        headers: headers,
        maxContentLength: Infinity,
        maxBodyLength: Infinity    
    }).catch((error : Error) => {
        throw error
    });

    if (response.data.status === "error") {
        throw new Error(response.data.message);
    }

    if (response.data?.error?.message) {
        throw new Error(response.data.error.message);
    }

    return response.data
}
