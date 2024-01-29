import axios from "./axios.js";
import { getAuthToken } from "../utils/accounts.js";
import { BACKEND_ENDPOINT } from "../constants.js";
import version from "../utils/version.js";
import { AuthStatus } from "./models.js";
import { AxiosResponse } from "axios";

export default async function getAuthStatus(envId: string): Promise<AuthStatus> {
    const authToken = await getAuthToken();

    if (!authToken) {
        throw new Error(
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

    return response.data;
}
