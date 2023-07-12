import { readUTF8File, writeToFile } from "./../utils/file.js";
import os from "os";
import path from "path";
import fs from "fs";
import { debugLogger } from '../utils/logging.js';

export async function getTelemetrySessionId(): Promise<string|undefined> {
    const homeDirectory = os.homedir();
    const loginConfigFilePath = path.join(homeDirectory, ".geneziotelemetryrc")
    try {
        const result = await readUTF8File(loginConfigFilePath)
        return result.trim();
    } catch(error) {
        debugLogger.debug(`An error occured during getTelemetrySessionId ${error}`)
        return undefined;
    }
}

export async function saveTelemetrySessionId(token: string) {
    const homeDirectory = os.homedir();
    const loginConfigFile = ".geneziotelemetryrc"

    await writeToFile(homeDirectory, loginConfigFile, token, true)
}
