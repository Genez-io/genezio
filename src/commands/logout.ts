import log from "loglevel";
import { exit } from "process";
import { GenezioTelemetry, TelemetryEventTypes } from "../telemetry/telemetry.js";
import { removeAuthToken } from "../utils/accounts.js";

export async function logoutCommand() {
    GenezioTelemetry.sendEvent({
        eventType: TelemetryEventTypes.GENEZIO_LOGOUT,
    });
    await removeAuthToken()
        .then(() => {
            log.info("You are now logged out!");
        })
        .catch((error: any) => {
            if (error.code === "ENOENT") {
                log.error("You were already logged out.");
            } else {
                log.error("Logout failed!");
            }
            exit(1);
        });
}
