import { spawn } from "child_process";
import { UserError } from "../errors.js";
import { runNewProcess } from "./process.js";
import colors from "colors";
import _ from "lodash";
import { Logger } from "tslog";

export async function runScript(
    scripts: string | string[] | undefined,
    cwd: string,
): Promise<void> {
    if (!scripts) {
        return;
    }

    if (!Array.isArray(scripts)) {
        scripts = [scripts];
    }

    for (const script of scripts) {
        const success = await runNewProcess(script, cwd);
        if (!success) throw new UserError(`Failed to run script: ${script}`);
    }
}

const frontendLogsColors = {
    order: [colors.magenta, colors.yellow, colors.green, colors.red],
    index: 0,
};

export async function runFrontendStartScript(
    scripts: string | string[] | undefined,
    cwd: string,
): Promise<void> {
    if (!scripts) {
        return;
    }

    if (!Array.isArray(scripts)) {
        scripts = [scripts];
    }

    const logColor =
        frontendLogsColors.order[frontendLogsColors.index++ % frontendLogsColors.order.length];

    const frontendLogger = new Logger({ name: "frontendLogger", prettyLogTemplate: "" });

    let debounceCount = 0;
    let logsBuffer: Buffer[] = [];
    // A debounce is needed when logs are printed on `data` event because the logs are printed in chunks.
    // We want to print chunk of logs together if they are printed within a short time frame.
    const debouncedLog = _.debounce(() => {
        debounceCount = 0;
        if (logsBuffer.length === 0) return;

        const logs = Buffer.concat(logsBuffer).toString().trim();
        frontendLogger.info(
            `${logColor(`[Frontend logs, path: ${cwd}]\n| `)}${logs.split("\n").join(`\n${logColor("| ")}`)}`,
        );
        logsBuffer = [];
    }, 400);

    const printFrontendLogs = (logChunk: Buffer) => {
        logsBuffer.push(logChunk);

        debounceCount += 1;
        // If we have 5 debounces, we should flush the logs
        if (debounceCount >= 5) {
            debouncedLog.flush();
            return;
        }

        debouncedLog();
    };

    for (const script of scripts) {
        await new Promise<void>((resolve, reject) => {
            const child = spawn(script, { cwd, shell: true, stdio: "pipe" });

            child.stderr.on("data", printFrontendLogs);
            child.stdout.on("data", printFrontendLogs);

            child.on("error", (error) => {
                reject(`Failed to run script: ${script} - ${error}`);
            });

            child.on("exit", (code) => {
                if (code !== 0 && code !== null) {
                    reject(`Failed to run script: ${script}`);
                }
                resolve();
            });
        }).catch((error) => {
            throw new UserError(error);
        });
    }
}
