import axios, { AxiosResponse } from "axios";
import { StatusOk, UserPayload } from "./models.js";
import { BACKEND_ENDPOINT } from "../constants.js";
import version from "../utils/version.js";

export default async function getUser(token: string): Promise<UserPayload> {
    const response: AxiosResponse<StatusOk<{ user: UserPayload }>> = await axios({
        method: "GET",
        url: `${BACKEND_ENDPOINT}/users/user`,
        headers: {
            Authorization: `Bearer ${token}`,
            "Accept-Version": `genezio-cli/${version}`,
        },
    });

    return response.data.user;
}
