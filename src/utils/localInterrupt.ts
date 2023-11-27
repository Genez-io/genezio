import os from "os";
import fsPromise from "fs/promises";
import path from "path";

export const interruptLocalPath = path.join(os.homedir(), ".genezio", "geneziointerrupt");

// Inform local processes to interrupt when a deployment has started
export async function interruptLocalProcesses() {
    const interruptLocal = await fsPromise.open(interruptLocalPath, "w");
    await interruptLocal.close();

    await fsPromise.utimes(interruptLocalPath, new Date(), new Date());
}
