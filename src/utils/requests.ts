import axios from "../requests/axios.js";
import { getAuthToken } from "./accounts.js";
import version from "./version.js";
import { BACKEND_ENDPOINT } from "../constants.js";
import { GENEZIO_NOT_AUTH_ERROR_MSG, UserError } from "../errors.js";

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
        throw new UserError(GENEZIO_NOT_AUTH_ERROR_MSG);
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
        throw new UserError(`An error occurred sending request ${method} on ${url}: ${error}`);
    }
};

export default sendRequest;
