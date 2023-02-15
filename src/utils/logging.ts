import log, { LogLevelDesc } from 'loglevel';

export const debugLogger = log.getLogger("debuggingLogger")

export function setDebuggingLoggerLogLevel(logLevel?: string) {
    if (!logLevel) return;

    debugLogger.setLevel(logLevel as LogLevelDesc)
}

const uninformative_messages = [
    "Calling the API for witty loading messages",
    "Asking on StackOverflow how to deploy your project…",
    "Changing the plumbing of the pipeline",
    "Rearranging the code randomly",
    "Calling the mothership for further instructions",
    "Somebody help, I'm trapped in this terminal",
    "Deploying…crossing our fingers",
    "Doing a barrel roll",
    "*playing elevator music*",
    "Spraying your code with bug repellents",
    "Baking a cake",
    "Changing spaces to tabs"
]

export function printUninformativeLog() {
    log.info(uninformative_messages[Math.floor(Math.random() * uninformative_messages.length)]);
}
