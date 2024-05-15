import axios, { AxiosResponse } from "axios";
import version from "../utils/version.js";
import {
    CloudProviderIdentifier,
    CloudProviderMapping,
} from "../models/cloudProviderIdentifier.js";
import { StatusOk } from "../requests/models.js";
import { getAuthToken } from "../utils/accounts.js";
import { BACKEND_ENDPOINT } from "../constants.js";
import { GENEZIO_NOT_AUTH_ERROR_MSG, UserError } from "../errors.js";
import { debugLogger } from "../utils/logging.js";

/** This function gets the cloud provider for a project before deployment
 * It returns the projects cloud provider for existing projects
 * and the default cloud provider for new projects
 *
 * This request should never fail, but because we do not want to cancel the deployment
 * because of an error here, we provide a default value if anything goes wrong.
 *
 * @param name - The name of the project
 * @returns The cloud provider identifier
 * @throws UserError if the user is not authenticated
 */
export async function getCloudProvider(name: string): Promise<CloudProviderIdentifier> {
    // Sending an axios request without the interceptor to silently fail if the project is not found.
    const uninterceptedAxiosInstance = axios.create();
    const authToken = await getAuthToken();

    if (!authToken) {
        throw new UserError(GENEZIO_NOT_AUTH_ERROR_MSG);
    }

    try {
        const response: AxiosResponse<StatusOk<{ cloudProvider: CloudProviderIdentifier }>> =
            await uninterceptedAxiosInstance({
                method: "GET",
                url: `${BACKEND_ENDPOINT}/projects/cloud-provider/${name}`,
                headers: {
                    Authorization: `Bearer ${authToken}`,
                    "Accept-Version": `genezio-cli/${version}`,
                },
            });
        if (response.data.cloudProvider) {
            return CloudProviderMapping[response.data.cloudProvider] ?? response.data.cloudProvider;
        }
    } catch (error) {
        debugLogger.error(`Error getting cloud provider for project ${name}: ${error}`);
    }
    return CloudProviderIdentifier.GENEZIO_CLOUD;
}
