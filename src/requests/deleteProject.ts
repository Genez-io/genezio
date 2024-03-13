import axios from "./axios.js";
import { getAuthToken } from "../utils/accounts.js";
import { BACKEND_ENDPOINT } from "../constants.js";
import { debugLogger, printAdaptiveLog, printUninformativeLog } from "../utils/logging.js";
import { AbortController } from "node-abort-controller";
import version from "../utils/version.js";
import { GenezioTelemetry, TelemetryEventTypes } from "../telemetry/telemetry.js";
import { GENEZIO_NOT_AUTH_ERROR_MSG, UserError } from "../errors.js";
import { AxiosResponse } from "axios";
import { StatusOk } from "./models.js";

export default async function deleteProject(projectId: string): Promise<boolean> {
    await GenezioTelemetry.sendEvent({
        eventType: TelemetryEventTypes.GENEZIO_DELETE_PROJECT,
    });

    printAdaptiveLog("Checking your credentials", "start");
    const authToken = await getAuthToken();
    if (!authToken) {
        printAdaptiveLog("Checking your credentials", "error");
        throw new UserError(GENEZIO_NOT_AUTH_ERROR_MSG);
    }
    printAdaptiveLog("Checking your credentials", "end");

    const controller = new AbortController();
    const messagePromise = printUninformativeLog(controller);
    const response: AxiosResponse<StatusOk> = await axios({
        method: "DELETE",
        url: `${BACKEND_ENDPOINT}/projects/${projectId}`,
        headers: {
            Authorization: `Bearer ${authToken}`,
            "Accept-Version": `genezio-cli/${version}`,
        },
    }).catch(async (error: Error) => {
        controller.abort();
        printAdaptiveLog(await messagePromise, "error");
        debugLogger.debug("Error received", error);
        throw error;
    });

    controller.abort();
    printAdaptiveLog(await messagePromise, "end");

    debugLogger.debug("Response received", response.data);

    return true;
}
