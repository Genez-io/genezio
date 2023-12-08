import { GENEZIO_NOT_AUTH_ERROR_MSG } from "../errors.js";
import { getAuthToken } from "../utils/accounts.js";

export async function accountCommand() {
    const authToken = await getAuthToken();
    if (!authToken) {
        throw new Error(GENEZIO_NOT_AUTH_ERROR_MSG);
    }
}
