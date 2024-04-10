import axios from "axios";
import os from "os";
import path from "path";
import { readUTF8File, writeToFile } from "../utils/file.js";
import { debugLogger } from "../utils/logging.js";
import { GA_API_SECRET, GA_MEASUREMENT_ID } from "../constants.js";

export async function getStoredClientId(): Promise<string | undefined> {
    const homeDirectory = os.homedir();
    const loginConfigFilePath = path.join(homeDirectory, ".genezio", "genezioanalytics");
    try {
        const result = await readUTF8File(loginConfigFilePath);
        return result.trim();
    } catch (error) {
        debugLogger.debug(`An error occurred during getTelemetrySessionId ${error}`);
        return undefined;
    }
}

async function generateNewClientId() {
    // Generate a random ten-digit number for the X part
    const partX = Math.floor(1000000000 + Math.random() * 9000000000);
    
    // Use the current Unix timestamp for the Y part
    const partY = Math.floor(Date.now() / 1000); // Date.now() returns milliseconds, so divide by 1000
    
    // Combine them into the desired format
    const clientId = `${partX}.${partY}`;

    const configDirectory = path.join(os.homedir(), ".genezio");
    const loginConfigFile = "genezioanalytics";

    await writeToFile(configDirectory, loginConfigFile, clientId, true);

    return clientId;
}

export async function trackEvent(eventName: string, userId?: string) {
    const clientId = await getStoredClientId() || await generateNewClientId();

     await axios.post(`https://www.google-analytics.com/mp/collect?measurement_id=${GA_MEASUREMENT_ID}&api_secret=${GA_API_SECRET}`, {
        client_id: clientId,
        user_id: userId,
        events: [{
            name: `cli_${eventName}`,
        }]
    })

}
