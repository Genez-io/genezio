import axios from "axios";
import os from "os";
import fs from "fs"
import path from "path";

export function readUTF8File(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
        fs.readFile(filePath, "utf8", function (error, data) {
            if (error) {
                reject(error);
            }
            resolve(data);
        });
    });
}

export async function getAuthToken(): Promise<string | undefined> {
    if (process.env["GENEZIO_TOKEN"]) {
        const result = process.env["GENEZIO_TOKEN"].trim();
        return result;
    }
    const homeDirectory = os.homedir();
    const loginConfigFilePath = path.join(homeDirectory, ".geneziorc");
    try {
        const result = await readUTF8File(loginConfigFilePath);
        return result.trim();
    } catch (error) {
        // eslint-disable-next-line no-console
        console.log(`An error occurred during getAuthToken ${error}`);
        return undefined;
    }
}


/**
 * Utility function to send HTTP requests using axios.
 * @param {string} method - The HTTP method (e.g., 'GET', 'POST', 'DELETE', etc.).
 * @param {string} url - The endpoint URL.
 * @param {Object} headers - The headers to include in the request.
 * @param {Object} [data] - The data to include in the request body (for POST, PUT, GET with body, etc.).
 * @returns {Promise} - The axios request promise.
 */
const sendRequest = async (method: string, endpoint: string, data: string) => {
    const authToken = await getAuthToken();
    if (!authToken) {
        throw new Error("You are not authenticated")
        // throw new UserError(GENEZIO_NOT_AUTH_ERROR_MSG);
    }

    const headers = {
        Authorization: `Bearer ${authToken}`,
        "Accept-Version": `genezio-cli/2.3.1`,
    };

    const url = `https://dev.api.genez.io/${endpoint}`;

    try {
        const response = await axios({
            method,
            url,
            headers,
            data,
        });
        return response.data;
    } catch (error) {
        // eslint-disable-next-line no-console
        console.log(`An error occurred sending request ${method} on ${url}: ${error}`);
        throw error;
    }
};

export default sendRequest;
