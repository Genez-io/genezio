import axios, { AxiosResponse } from "axios";
import { StatusOk, UserPayload } from "./models.js";
import { BACKEND_ENDPOINT } from "../constants.js";
import version from "../utils/version.js";
import { GENEZIO_NOT_AUTH_ERROR_MSG } from "../errors.js";
import { getAuthToken } from "../utils/accounts.js";

export default async function getUser(): Promise<UserPayload> {
    const authToken = await getAuthToken();
    if (!authToken) {
        throw new Error(GENEZIO_NOT_AUTH_ERROR_MSG);
    }

    const response: AxiosResponse<StatusOk<{ user: UserPayload }>> = await axios({
        method: "GET",
        url: `${BACKEND_ENDPOINT}/users/user`,
        headers: {
            Authorization: `Bearer ${authToken}`,
            "Accept-Version": `genezio-cli/${version}`,
        },
    });

    return response.data.user;
}
