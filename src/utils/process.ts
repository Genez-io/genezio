import { exec } from "child_process";
import { debugLogger } from "./logging.js";

export function runNewProcess(command: string, cwd?: string): Promise<void> {
    return new Promise(function (resolve, reject) {
        exec(command, { cwd }, (err, stdout, stderr) => {
            if (err) {
                reject(err);
            } else {
                resolve();
            }

            debugLogger.debug(stdout);
            debugLogger.debug(stderr);
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
