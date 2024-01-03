import axios, { AxiosResponse } from "axios";
import { Status, UserPayload } from "./models.js";
import { BACKEND_ENDPOINT } from "../constants.js";
import version from "../utils/version.js";

export default async function getUser(token: string): Promise<UserPayload> {
    const response: AxiosResponse<Status<{ user: UserPayload }>> = await axios({
        method: "GET",
        url: `${BACKEND_ENDPOINT}/users/user`,
        headers: {
            Authorization: `Bearer ${token}`,
            "Accept-Version": `genezio-cli/${version}`,
        },
    });

    if (response.data.status === "error") {
        throw new Error(response.data.error.message);
    }

    return response.data.user;
}
