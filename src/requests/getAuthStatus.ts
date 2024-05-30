import axios from "./axios.js";
import { getAuthToken } from "../utils/accounts.js";
import { BACKEND_ENDPOINT } from "../constants.js";
import version from "../utils/version.js";
import { AuthStatus } from "./models.js";
import { AxiosResponse } from "axios";
import { CloudProviderIdentifier } from "../models/cloudProviderIdentifier.js";
import { UserError } from "../errors.js";

export default async function getAuthStatus(envId: string): Promise<AuthStatus> {
    const authToken = await getAuthToken();

    if (!authToken) {
        throw new UserError(
            "You are not logged in. Run 'genezio login' before you deploy your function.",
        );
    }

    const response: AxiosResponse<AuthStatus> = await axios({
        method: "GET",
        url: `${BACKEND_ENDPOINT}/core/auth/${envId}`,
        headers: {
            Authorization: `Bearer ${authToken}`,
            "Accept-Version": `genezio-cli/${version}`,
        },
    });

    const authStatus = response.data;

    if (authStatus.enabled) {
        const cloud = authStatus.token.split("-")[0];
        const id = authStatus.token.split("-").slice(1).join("-");
        switch (cloud) {
            case "0":
                authStatus.cloudProvider = CloudProviderIdentifier.GENEZIO_AWS;
                authStatus.token = id;
                break;
            case "1":
                authStatus.cloudProvider = CloudProviderIdentifier.GENEZIO_CLOUD;
                authStatus.token = id;
                break;
            default:
                throw new UserError("Wrong auth token format. Check your token and try again");
        }
    }

    return response.data;
}
