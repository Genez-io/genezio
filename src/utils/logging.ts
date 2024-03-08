import { Logger } from "tslog";
import { AbortController } from "node-abort-controller";
import colors from "colors";
import ora from "ora";
import { AxiosError } from "axios";
import { GENEZIO_NOT_AUTH_ERROR_MSG } from "../errors.js";
import { ENVIRONMENT } from "../constants.js";

const spinner = ora();

export const debugLogger = new Logger({
    name: "debuggingLogger",
    prettyLogTemplate: "{{hh}}:{{MM}}:{{ss}}:{{ms}} {{logLevelName}}\t{{fileNameWithLine}}\t",
    minLevel: 7,
    hideLogPositionForProduction: ENVIRONMENT === "prod",
    prettyInspectOptions: {
        depth: 1,
        colors: true,
    },
});

export const log = new Logger({
    name: "mainLogger",
    prettyLogTemplate: "",
    minLevel: 3,
    hideLogPositionForProduction: true,
    prettyErrorTemplate: "\n{{errorName}} {{errorMessage}}\n",
    prettyLogStyles: {
        errorName: ["bold", "bgRedBright", "whiteBright"],
        errorMessage: ["bold", "red"],
    },
});

export function logError(error: Error) {
    debugLogger.fatal(error);
    if (error instanceof AxiosError) {
        const data = error.response?.data;

        switch (error.response?.status) {
            case 401:
                log.error(new Error(GENEZIO_NOT_AUTH_ERROR_MSG));
                break;
            case 500:
                log.error(new Error(error.message));
                if (data && data.status === "error") {
                    log.error(new Error(data.error.message));
                }
                break;
            case 400:
                log.error(new Error(error.message));
                if (data && data.status === "error") {
                    log.error(new Error(data.error.message));
                }
                break;
            default:
                if (error.message) {
                    log.error(new Error(error.message));
                }
                break;
        }
    } else {
        log.error(new Error(error.message));
    }
}

function getLogLevel(logLevel: string): number {
    switch (logLevel) {
        case "silly":
            return 0;
        case "trace":
            return 1;
        case "debug":
            return 2;
        case "info":
            return 3;
        case "warn":
            return 4;
        case "error":
            return 5;
        case "fatal":
            return 6;
        default:
            return 3;
    }
}

export function setDebuggingLoggerLogLevel(logLevel?: string) {
    if (!logLevel) return;

    debugLogger.settings.minLevel = getLogLevel(logLevel);
}

export function printAdaptiveLog(message: string, state: string) {
    if (state == "end") {
        spinner.succeed(`${colors.green(message)}`);
    } else if (state == "start") {
        spinner.start(message);
    } else {
        spinner.fail(`${colors.red(message)}`);
    }
}

export async function doAdaptiveLogAction<T>(message: string, action: () => Promise<T>) {
    return action()
        .then((result) => {
            spinner.succeed(`${colors.green(message)}`);
            return result;
        })
        .catch((error) => {
            spinner.fail(`${colors.red(message)}`);
            throw error;
        });
}

export function code(code: string): string {
    return colors.cyan(code);
}

const uninformativeMessages = [
    "Calling the API for witty loading messages",
    "Changing the plumbing of the pipeline",
    "Rearranging the code randomly",
    "Calling the mothership for further instructions",
    "Doing a barrel roll",
    "*playing elevator music*",
    "Spraying your code with bug repellents",
    "Baking a cake",
    "Changing spaces to tabs",
    "Tightening the screws of our servers",
    "Seeding some new clouds for your deployment...",
    "Drying up a cloud for future usage...",
    "Warming up the servers with some hot drinks",
    "Instructing the servers into the ways of the Force",
    "Giving some food for thought to our neural network",
    "Booting the servers, because someone has to do it...",
    "Casting an efficiency spell on your code",
    "Unpacking your code archive with care",
    "Preparing our server hamsters for your code's grand entrance",
];

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function printUninformativeLog(controller: AbortController): Promise<string> {
    const finalMessage = "Doing the final touch-ups";
    const message = uninformativeMessages[Math.floor(Math.random() * uninformativeMessages.length)];
    let exitLoop = false;
    let waiting = 0;
    let spinning = true;
    let firstMessage = false;

    controller.signal.addEventListener("abort", () => {
        exitLoop = true;
    });

    while (!exitLoop) {
        await delay(250);
        waiting += 250;

        if (waiting == 5000) {
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
        printAdaptiveLog(finalMessage, "start");
        return finalMessage;
    }

    if (firstMessage) {
        return message;
    } else {
        return finalMessage;
    }
}
