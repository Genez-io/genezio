import { Logger } from "tslog";
import { AbortController } from "node-abort-controller";
import colors from "colors";
import ora from "ora";

const spinner = ora();

export const debugLogger = new Logger({
    name: "debuggingLogger",
    prettyLogTemplate: "{{dateIsoStr}} {{logLevelName}}\t{{fileNameWithLine}}\t",
    minLevel: 7,
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
    log.error(new Error(error.message));
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
    "Asking on StackOverflow how to deploy your project",
    "Changing the plumbing of the pipeline",
    "Rearranging the code randomly",
    "Calling the mothership for further instructions",
    "Deploying...crossing our fingers",
    "Doing a barrel roll",
    "*playing elevator music*",
    "Spraying your code with bug repellents",
    "Baking a cake",
    "Changing spaces to tabs",
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

    // spinner.start();

    while (!exitLoop) {
        await delay(250);
        waiting += 250;

        if (waiting == 5000) {
            // spinner.stop(true);
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
        // spinner.stop(true);
        printAdaptiveLog(finalMessage, "start");
        return finalMessage;
    }

    if (firstMessage) {
        return message;
    } else {
        return finalMessage;
    }
}
