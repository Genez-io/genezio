/**
 * This is an auto generated code. This code should not be modified since the file can be overwritten
 * if new genezio commands are executed.
 */

import { GENEZIO_TELEMETRY_ENDPOINT } from "../../constants.js";
import { Remote } from "./remote.js";

export type AnalyticsData = {
    env: string;
    eventType: string;
    sessionId: string;
    operatingSystem: string;
    userLanguage?: string;
    cloudProvider?: string;
    errTrace?: string;
    timeZone?: string;
    genezioVersion?: string;
    commandOptions?: string;
    isCI?: boolean;
};

export class AnalyticsHandler {
    static remote = new Remote(GENEZIO_TELEMETRY_ENDPOINT);

    static async sendEvent(telemetryData: AnalyticsData) {
        return await AnalyticsHandler.remote.call("AnalyticsHandler.sendEvent", telemetryData);
    }
}

export { Remote };
