import { debugLogger } from '../utils/logging.js';
import { AnalyticsData, AnalyticsHandler } from './sdk/analyticsHandler.sdk.js';
import { getTelemetrySessionId, saveTelemetrySessionId } from './session.js';
import { v4 as uuidv4 } from 'uuid';

export class GenezioTelemetry {

  static async getSessionId(): Promise<string> {
    const sessionId = await getTelemetrySessionId();
    if (!sessionId) {
      const newSessionId = uuidv4();
      debugLogger.debug(`[GenezioTelemetry]`, `New session id: ${newSessionId}`);
      saveTelemetrySessionId(newSessionId);
      return newSessionId;
    }
    
    return sessionId;
  }

  public static async sendEvent(eventType: string, cloudProvider?: string, errorTrace?: string): Promise<void> {
    if (process.env.GENEZIO_NO_TELEMETRY == "1") {
      debugLogger.debug(`[GenezioTelemetry]`, `Telemetry disabled by user`);
      return;
    }

    // get user language
    const userLanguage: string = Intl.DateTimeFormat().resolvedOptions().locale;
    // get user operating system
    const operatingSystem: string = process.platform;
    const sessionId: string = await this.getSessionId();

    // get user country
    const timeZone: string = Intl.DateTimeFormat().resolvedOptions().timeZone;

    // send event to telemetry
    debugLogger.debug(`[GenezioTelemetry]`, `${timeZone} ${eventType} ${sessionId} ${userLanguage} ${operatingSystem} ${cloudProvider} ${errorTrace}`);

    // send event to analytics
    const analyticsData: AnalyticsData = {
      eventType,
      sessionId,
      operatingSystem,
      userLanguage,
      cloudProvider,
      errTrace: errorTrace,
      timeZone: timeZone
    };
      
    await AnalyticsHandler.sendEvent(analyticsData).catch((err) => {
      debugLogger.error(`[GenezioTelemetry]`, `Error sending event to analytics: ${err}`);
    });
    return;
  }
}