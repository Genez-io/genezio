import { readUTF8File, writeToFile } from "./../utils/file.js";
import os from "os";
import path from "path";
import { debugLogger } from "../utils/logging.js";

export async function getTelemetrySessionId(): Promise<string | undefined> {
    const homeDirectory = os.homedir();
    const loginConfigFilePath = path.join(homeDirectory, ".genezio", "geneziotelemetryrc");
    try {
        const result = await readUTF8File(loginConfigFilePath);
        return result.trim();
    } catch (error) {
        debugLogger.debug(`An error occurred during getTelemetrySessionId ${error}`);
        return undefined;
    }
}

export async function saveTelemetrySessionId(token: string) {
    const configDirectory = path.join(os.homedir(), ".genezio");
    const loginConfigFile = "geneziotelemetryrc";

    await writeToFile(configDirectory, loginConfigFile, token, true);
}
