import axios from "axios";
import { GENEZIO_NOT_AUTH_ERROR_MSG, UserError } from "../errors.js";
import { getAuthToken } from "../utils/accounts.js";
import { BACKEND_ENDPOINT } from "../constants.js";
import version from "../utils/version.js";

export default async function deleteStage(projectId: string, stage: string) {
    const authToken = await getAuthToken();
    if (!authToken) {
        throw new UserError(GENEZIO_NOT_AUTH_ERROR_MSG);
    }

    await axios({
        method: "DELETE",
        url: `${BACKEND_ENDPOINT}/projects/${projectId}/stages/${stage}`,
        headers: {
            Authorization: `Bearer ${authToken}`,
            "Accept-Version": `genezio-cli/${version}`,
        },
    });
}
