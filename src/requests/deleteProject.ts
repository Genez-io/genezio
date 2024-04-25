import axios from "./axios.js";
import { getAuthToken } from "../utils/accounts.js";
import { BACKEND_ENDPOINT } from "../constants.js";
import version from "../utils/version.js";
import { GenezioTelemetry, TelemetryEventTypes } from "../telemetry/telemetry.js";
import { GENEZIO_NOT_AUTH_ERROR_MSG, UserError } from "../errors.js";

export default async function deleteProject(projectId: string): Promise<void> {
    await GenezioTelemetry.sendEvent({
        eventType: TelemetryEventTypes.GENEZIO_DELETE_PROJECT,
    });

    const authToken = await getAuthToken();
    if (!authToken) {
        throw new UserError(GENEZIO_NOT_AUTH_ERROR_MSG);
    }

    await axios({
        method: "DELETE",
        url: `${BACKEND_ENDPOINT}/projects/${projectId}`,
        headers: {
            Authorization: `Bearer ${authToken}`,
            "Accept-Version": `genezio-cli/${version}`,
        },
    });
}
