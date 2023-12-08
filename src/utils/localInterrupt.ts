import os from "os";
import fsPromise from "fs/promises";
import path from "path";
import { writeToFile } from "./file.js";

export const interruptLocalPath = path.join(os.homedir(), ".genezio", "geneziointerrupt");

export async function getInterruptLastModifiedTime() {
    try {
        const stats = await fsPromise.stat(interruptLocalPath);
        return stats.mtimeMs;
    } catch (err) {
        return 0;
    }
}

// Inform local processes to interrupt when a deployment has started
export async function interruptLocalProcesses() {
    await writeToFile(path.join(os.homedir(), ".genezio"), "geneziointerrupt", "", true);
}
