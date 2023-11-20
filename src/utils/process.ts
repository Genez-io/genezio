import { exec } from "child_process";
import log from "loglevel";
import { debugLogger } from "./logging.js";

export function runNewProcess(
    command: string,
    cwd?: string,
    showStdoutOutput = false,
    showStderrOutput = true,
): Promise<boolean> {
    return new Promise(function (resolve) {
        exec(command, { cwd }, (err, stdout, stderr) => {
            if (err) {
                log.error(err);
                resolve(false);
            } else {
                resolve(true);
            }

            if (showStdoutOutput) {
                log.info(stdout);
            } else {
                debugLogger.debug(stdout);
            }

            if (showStderrOutput) {
                log.info(stderr);
            }
        });
    });
}

export function runNewProcessWithResult(command: string, cwd?: string): Promise<string> {
    return new Promise(function (resolve) {
        exec(command, { cwd }, (err, stdout, stderr) => {
            if (err) {
                resolve(stderr);
            } else {
                resolve(stdout);
            }
        });
    });
}

export function runNewProcessWithResultAndReturnCode(
    command: string,
    cwd?: string,
): Promise<{ stdout: string; stderr: string; code: number }> {
    return new Promise(function (resolve) {
        exec(command, { cwd }, (err, stdout, stderr) => {
            if (err) {
                resolve({ stdout, stderr, code: err.code || -1 });
            } else {
                resolve({ stdout, stderr, code: 0 });
            }
        });
    });
}
