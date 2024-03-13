import axios, { AxiosResponse } from "axios";
import version from "../utils/version.js";
import { CloudProviderIdentifier } from "../models/cloudProviderIdentifier.js";
import { ProjectDetails, StatusOk } from "../requests/models.js";
import { getAuthToken } from "./accounts.js";
import { BACKEND_ENDPOINT } from "../constants.js";
import { GENEZIO_NOT_AUTH_ERROR_MSG, UserError } from "../errors.js";

// This function is used to check if the project is already deployed.
// Do not reuse this method in the future, this is only used for AB testing and it will be removed soon.
export async function isProjectDeployed(name: string, region: string): Promise<boolean> {
    try {
        // Sending an axios request without the interceptor to silently fail if the project is not found.
        const uninterceptedAxiosInstance = axios.create();
        const authToken = await getAuthToken();

        if (!authToken) {
            throw new UserError(GENEZIO_NOT_AUTH_ERROR_MSG);
        }

        const response: AxiosResponse<StatusOk<{ project: ProjectDetails }>> =
            await uninterceptedAxiosInstance({
                method: "GET",
                url: `${BACKEND_ENDPOINT}/projects/name/${name}`,
                params: {
                    region: region,
                },
                headers: {
                    Authorization: `Bearer ${authToken}`,
                    "Accept-Version": `genezio-cli/${version}`,
                },
            });
        if (response.data.project) {
            return true;
        }
    } catch (error) {
        return false;
    }
    return false;
}

// This function is used to randomly select a cloud provider for AB testing.
export function getRandomCloudProvider(): CloudProviderIdentifier {
    return Math.random() < 0.5
        ? CloudProviderIdentifier.GENEZIO
        : CloudProviderIdentifier.CAPYBARA_LINUX;
}
