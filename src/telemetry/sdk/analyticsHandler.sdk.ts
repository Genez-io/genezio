/**
* This is an auto generated code. This code should not be modified since the file can be overwriten
* if new genezio commands are executed.
*/

import { Remote } from "./remote.js";

export type AnalyticsData = {eventType: string, sessionId: string, opS: string, ul?: string, cl?: string, errTrace?: string, timeZone?: string};

export class AnalyticsHandler {
  static remote = new Remote("http://127.0.0.1:8083/AnalyticsHandler");

  static async sendEvent(telemetryData: AnalyticsData) {
    return await AnalyticsHandler.remote.call("AnalyticsHandler.sendEvent", telemetryData);
  }
}

export { Remote };
