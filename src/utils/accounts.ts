import { readUTF8File, writeToFile } from "./file.js";
import os from "os";
import path from "path";
import fs from "fs";
import { debugLogger } from "./logging.js";
import { GENEZIO_REGISTRY } from "../constants.js";

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

function getNpmConfigFileContent(token: string) {
    return `@genezio-sdk:registry=https://${GENEZIO_REGISTRY}/npm\n//${GENEZIO_REGISTRY}/:_authToken=${token}`
}

export async function saveAuthToken(token: string) {
    const homeDirectory = os.homedir();
    const loginConfigFile = ".geneziorc"
    const npmConfigFile = ".npmrc"
    const npmConfigContent = getNpmConfigFileContent(token);

    await writeToFile(homeDirectory, loginConfigFile, token, true);
    await writeToFile(homeDirectory, npmConfigFile, npmConfigContent, true);
}

export async function removeAuthToken(): Promise<[void, void]> {
    const homeDirectory = os.homedir();
    const loginConfigFilePath = path.join(homeDirectory, ".geneziorc")
    const npmConfigFilePath = path.join(homeDirectory, ".npmrc")

    const geneziorcPromise: Promise<void> = new Promise((resolve, reject) => {
        fs.unlink(loginConfigFilePath, (error) => {
            if (error) {
                reject(error)
            }

            resolve();
        });
    });

    const npmrcPromise: Promise<void> = new Promise((resolve, reject) => {
        fs.unlink(npmConfigFilePath, (error) => {
            if (error) {
                reject(error)
            }

            resolve();
        });
    });

    return Promise.all([geneziorcPromise, npmrcPromise])
}
