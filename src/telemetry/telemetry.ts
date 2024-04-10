import { debugLogger } from "../utils/logging.js";
import { AnalyticsData, AnalyticsHandler } from "./sdk/analyticsHandler.sdk.js";
import { getTelemetrySessionId, saveTelemetrySessionId } from "./session.js";
import { v4 as uuidv4 } from "uuid";
import { AMPLITUDE_API_KEY, ENVIRONMENT } from "../constants.js";
import version from "../utils/version.js";
import { trackEvent } from "../requests/gaTrackEvent.js";
import { track, init, Types } from '@amplitude/analytics-node';
import getUser from "../requests/getUser.js";
import { UserPayload } from "../requests/models.js";

init(AMPLITUDE_API_KEY, {
    flushQueueSize: 1,
    flushIntervalMillis: 100,
}
);

export type EventRequest = {
    eventType: TelemetryEventTypes;
    cloudProvider?: string;
    errorTrace?: string;
    commandOptions?: string;
};

let user: UserPayload | undefined;

async function getCachedUser(): Promise<UserPayload|undefined> {
    if (!user) {
        user = await getUser().catch(() => undefined);
    }
    return user;
}

export enum TelemetryEventTypes {
    GENEZIO_CANCEL = "GENEZIO_CANCEL",
    GENEZIO_LOGIN_ERROR = "GENEZIO_LOGIN_ERROR",
    GENEZIO_ADD_CLASS_ERROR = "GENEZIO_ADD_CLASS_ERROR",
    GENEZIO_LOCAL_ERROR = "GENEZIO_LOCAL_ERROR",
    GENEZIO_GENERATE_SDK_ERROR = "GENEZIO_GENERATE_SDK_ERROR",
    GENEZIO_ADD_CLASS = "GENEZIO_ADD_CLASS",
    GENEZIO_DEPLOY_ERROR = "GENEZIO_DEPLOY_ERROR",
    GENEZIO_PRE_START_LOCAL_SCRIPT_ERROR = "GENEZIO_PRE_START_LOCAL_SCRIPT_ERROR",
    GENEZIO_POST_START_LOCAL_SCRIPT_ERROR = "GENEZIO_PRE_START_LOCAL_SCRIPT_ERROR",
    GENEZIO_PRE_RELOAD_LOCAL_SCRIPT_ERROR = "GENEZIO_POST_RELOAD_LOCAL_SCRIPT_ERROR",
    GENEZIO_PRE_BACKEND_DEPLOY_SCRIPT_ERROR = "GENEZIO_PRE_BACKEND_DEPLOY_SCRIPT_ERROR",
    GENEZIO_BACKEND_DEPLOY_START = "GENEZIO_BACKEND_DEPLOY_START",
    GENEZIO_BACKEND_DEPLOY_ERROR = "GENEZIO_BACKEND_DEPLOY_ERROR",
    GENEZIO_BACKEND_DEPLOY_END = "GENEZIO_BACKEND_DEPLOY_END",
    GENEZIO_POST_BACKEND_DEPLOY_SCRIPT_ERROR = "GENEZIO_POST_BACKEND_DEPLOY_SCRIPT_ERROR",
    GENEZIO_PRE_FRONTEND_DEPLOY_SCRIPT_ERROR = "GENEZIO_PRE_FRONTEND_DEPLOY_SCRIPT_ERROR",
    GENEZIO_FRONTEND_DEPLOY_START = "GENEZIO_FRONTEND_DEPLOY_START",
    GENEZIO_FRONTEND_DEPLOY_ERROR = "GENEZIO_FRONTEND_DEPLOY_ERROR",
    GENEZIO_FRONTEND_DEPLOY_END = "GENEZIO_FRONTEND_DEPLOY_END",
    GENEZIO_POST_FRONTEND_DEPLOY_SCRIPT_ERROR = "GENEZIO_POST_FRONTEND_DEPLOY_SCRIPT_ERROR",
    GENEZIO_GENERATE_SDK = "GENEZIO_GENERATE_SDK",
    GENEZIO_INIT = "GENEZIO_INIT",
    GENEZIO_INIT_ERROR = "GENEZIO_INIT_ERROR",
    GENEZIO_LOCAL = "GENEZIO_LOCAL",
    GENEZIO_LOCAL_RELOAD = "GENEZIO_LOCAL_RELOAD",
    GENEZIO_LOGIN = "GENEZIO_LOGIN",
    GENEZIO_LOGOUT = "GENEZIO_LOGOUT",
    GENEZIO_LS = "GENEZIO_LS",
    GENEZIO_LS_ERROR = "GENEZIO_LS_ERROR",
    GENEZIO_DELETE_PROJECT = "GENEZIO_DELETE_PROJECT",
    GENEZIO_DELETE_PROJECT_ERROR = "GENEZIO_DELETE_PROJECT_ERROR",
    GENEZIO_DEPLOY_LOAD_ENV_VARS = "GENEZIO_DEPLOY_LOAD_ENV_VARS",
    GENEZIO_COMMAND_ERROR = "GENEZIO_COMMAND_ERROR",
    GENEZIO_COMMAND = "GENEZIO_COMMAND",
    GENEZIO_CREATE = "GENEZIO_CREATE",
    GENEZIO_CREATE_ERROR = "GENEZIO_CREATE_ERROR",
    GENEZIO_CREATE_INTERACTIVE = "GENEZIO_CREATE_INTERACTIVE",
    GENEZIO_CREATE_INTERACTIVE_ERROR = "GENEZIO_CREATE_INTERACTIVE_ERROR",
    GENEZIO_CREATE_TEMPLATE_LIST = "GENEZIO_CREATE_TEMPLATE_LIST",
    GENEZIO_CREATE_TEMPLATE_LIST_ERROR = "GENEZIO_CREATE_TEMPLATE_LIST_ERROR",
}

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

    public static async sendEvent(eventRequest: EventRequest): Promise<void> {
        if (process.env["GENEZIO_NO_TELEMETRY"] == "1") {
            debugLogger.debug(`[GenezioTelemetry]`, `Telemetry disabled by user`);
            return;
        }

        // get user language
        const userLanguage: string = Intl.DateTimeFormat().resolvedOptions().locale;
        // get user operating system
        const operatingSystem: string = process.platform;
        const sessionId: string = await this.getSessionId().catch((err) => {
            debugLogger.debug(`[GenezioTelemetry]`, `Error getting session id: ${err}`);
            return "";
        });

        if (!sessionId) {
            return;
        }

        // get user country
        const timeZone: string = Intl.DateTimeFormat().resolvedOptions().timeZone;

        // send event to telemetry
        debugLogger.trace(
            `[GenezioTelemetry]`,
            `${timeZone} ${eventRequest.eventType} ${sessionId} ${userLanguage} ${operatingSystem} ${eventRequest.cloudProvider} ${eventRequest.errorTrace}`,
        );

        // send event to analytics
        const analyticsData: AnalyticsData = {
            env: ENVIRONMENT,
            eventType: eventRequest.eventType as string,
            sessionId,
            operatingSystem,
            userLanguage,
            cloudProvider: eventRequest.cloudProvider,
            errTrace: eventRequest.errorTrace,
            timeZone: timeZone,
            genezioVersion: version,
            commandOptions: eventRequest.commandOptions || "",
            isCI: process.env["CI"] ? true : false,
            nodeVersion: process.version,
        };
        const user = await getCachedUser().catch(() => undefined);
        const eventName = (eventRequest.eventType as string).toLowerCase();

        const amplitudePromise = ENVIRONMENT === "dev" ? Promise.resolve() : track(eventName, undefined, {
            device_id: sessionId,
            user_id: user?.id,
        }).promise
        const gaPromise = ENVIRONMENT === "dev" ? Promise.resolve() : trackEvent((eventRequest.eventType as string).toLowerCase(), user?.id);
        const analytics = AnalyticsHandler.sendEvent(analyticsData).catch((err) => {
            debugLogger.debug(`[GenezioTelemetry]`, `Error sending event to analytics: ${err}`);
        });

        await Promise.all([gaPromise, analytics, amplitudePromise]);
    }
}
