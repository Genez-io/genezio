import log, { LogLevelDesc } from 'loglevel';
import { Spinner } from "cli-spinner";
import { AbortController } from "node-abort-controller";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const terminalOverwrite = require('terminal-overwrite');

export const spinner = new Spinner("%s  ");
spinner.setSpinnerString("|/-\\");

export const debugLogger = log.getLogger("debuggingLogger")

export function setDebuggingLoggerLogLevel(logLevel?: string) {
    if (!logLevel) return;

    debugLogger.setLevel(logLevel as LogLevelDesc)
}

export function printAdaptiveLog(message: string, state: string) {
    if (state == "end") {
        spinner.stop(true);
        terminalOverwrite(message + "...✅");
        log.info("");
    } else if (state == "start") {
        terminalOverwrite(message + "...");
        spinner.start();
    } else {
        spinner.stop(true);
        terminalOverwrite(message + "...❌");
        log.info("");
    }
}

const uninformativeMessages = [
    "Calling the API for witty loading messages",
    "Asking on StackOverflow how to deploy your project",
    "Changing the plumbing of the pipeline",
    "Rearranging the code randomly",
    "Calling the mothership for further instructions",
    "Deploying...crossing our fingers",
    "Doing a barrel roll",
    "*playing elevator music*",
    "Spraying your code with bug repellents",
    "Baking a cake",
    "Changing spaces to tabs"
]

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export async function printUninformativeLog(controller: AbortController): Promise<string> {
    const finalMessage = "Doing the final touch-ups";
    const message = uninformativeMessages[Math.floor(Math.random() * uninformativeMessages.length)];
    let exitLoop = false;
    let waiting = 0;
    let spinning = true;
    let firstMessage = false;

    controller.signal.addEventListener('abort', () => {
        exitLoop = true;
    });

    spinner.start();

    while (!exitLoop) {
        await delay(250);
        waiting += 250;

        if (waiting == 5000) {
            spinner.stop(true);
            spinning = false;
            printAdaptiveLog(message, "start");
            firstMessage = true;
        }

        if (waiting == 15000) {
            printAdaptiveLog(message, "end");
            firstMessage = false;
            printAdaptiveLog(finalMessage, "start");
        }
    }

    if (spinning) {
        spinner.stop(true);
        printAdaptiveLog(finalMessage, "start");
        return finalMessage;
    }

    if (firstMessage) {
        return message;
    } else {
        return finalMessage;
    }
}
