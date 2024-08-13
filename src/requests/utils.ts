import axios from "axios";
import { getAuthToken } from "../utils/accounts.js";
import version from "../utils/version.js";
import { BACKEND_ENDPOINT } from "../constants.js";

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
        throw new Error("You are not authenticated");
        // throw new UserError(GENEZIO_NOT_AUTH_ERROR_MSG);
    }

    const headers = {
        Authorization: `Bearer ${authToken}`,
        "Accept-Version": `genezio-cli/${version}`,
    };

    const url = `${BACKEND_ENDPOINT}/${endpoint}`;

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
