import log, { LogLevelDesc } from 'loglevel';

export const debugLogger = log.getLogger("debuggingLogger")

export function setDebuggingLoggerLogLevel(logLevel?: string) {
    if (!logLevel) return;

    debugLogger.setLevel(logLevel as LogLevelDesc)
}