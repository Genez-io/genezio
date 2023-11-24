import log from "loglevel";
import { exit } from "process";
import { GenezioTelemetry, TelemetryEventTypes } from "../telemetry/telemetry.js";
import { removeAuthToken } from "../utils/accounts.js";
import { debugLogger } from "../utils/logging.js";

export async function logoutCommand() {
    GenezioTelemetry.sendEvent({
        eventType: TelemetryEventTypes.GENEZIO_LOGOUT,
    });
    await removeAuthToken().then(([login, ...scopedRegistries]) => {
        if (login.status === "rejected") {
            log.error("Logout failed!");
            exit(1);
        }

        scopedRegistries.forEach((scopedRegistry) => {
            if (scopedRegistry.status === "rejected") {
                debugLogger.debug(`Scoped registry removal failed: ${scopedRegistry.reason}`);
            }
        });

        log.info("You are now logged out!");
    });
}
