import { readUTF8File, writeToFile } from "./file.js";
import os from "os";
import path from "path";
import fs from "fs";
import { debugLogger } from "./logging.js";

export async function getAuthToken(): Promise<string|undefined> {
    const homeDirectory = os.homedir();
    const loginConfigFilePath = path.join(homeDirectory, ".geneziorc")
    try {
        const result = await readUTF8File(loginConfigFilePath)
        return result.trim();
    } catch(error) {
        debugLogger.debug(`An error occurred during getAuthToken ${error}`)
        return undefined;
    }
}

export async function saveAuthToken(token: string) {
    const homeDirectory = os.homedir();
    const loginConfigFile = ".geneziorc"

    await writeToFile(homeDirectory, loginConfigFile, token, true)
}

export async function removeAuthToken(): Promise<void> {
    const homeDirectory = os.homedir();
    const loginConfigFilePath = path.join(homeDirectory, ".geneziorc")

    return new Promise((resolve, reject) => {
        fs.unlink(loginConfigFilePath, (error) => {
            if (error) {
                reject(error)
            }

            resolve();
        })
    })
}
