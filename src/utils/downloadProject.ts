import axios from "axios";
import fs from "fs";
import { debugLogger } from "../utils/logging.js";

export async function downloadProject(url: string, path: string): Promise<void> {
    return new Promise((resolve, reject) => {
        // download the archive to the temporary folder
        const writer = fs.createWriteStream(path);

        axios({
            method: "get",
            url,
            responseType: "stream",
        })
            .then((response) => {
                response.data.pipe(writer);
            })
            .catch((error) => {
                debugLogger.debug(`Failed to download project: ${error}`);
                reject(
                    new Error(
                        "Failed to download project. Make sure the project exists and you have access to it.",
                    ),
                );
            });
        writer.on("finish", () => {
            debugLogger.debug("File downloaded successfully.");
            resolve();
        });
        writer.on("error", (err) => {
            debugLogger.debug(err);
            reject(err);
        });
    });
}
