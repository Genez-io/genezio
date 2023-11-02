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

export async function addAuthTokenToNpmConfig(token: string) {
    const homeDirectory = os.homedir();
    const npmConfigFile = ".npmrc"
    let npmConfigContent = getNpmConfigFileContent(token);

    if (fs.existsSync(path.join(homeDirectory, npmConfigFile))) {
        const npmConfigFileContent = await readUTF8File(path.join(homeDirectory, npmConfigFile));
        if (npmConfigFileContent.includes(`//${GENEZIO_REGISTRY}/:_authToken=`)) {
            npmConfigContent = npmConfigFileContent.replaceAll(
                new RegExp(`(//${GENEZIO_REGISTRY}/:_authToken=)(.*)(\n?)`, "g"),
                `$1${token}$3`
            );
        } else {
            npmConfigContent = npmConfigFileContent + "\n" + npmConfigContent;
        }
    }

    await writeToFile(homeDirectory, npmConfigFile, npmConfigContent, true);
}

export async function saveAuthToken(token: string) {
    const homeDirectory = os.homedir();
    const loginConfigFile = ".geneziorc"

    await writeToFile(homeDirectory, loginConfigFile, token, true);
    await addAuthTokenToNpmConfig(token);
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

    let updateNpmConfigPromise = Promise.resolve();
    if (fs.existsSync(npmConfigFilePath)) {
        const configContent = await readUTF8File(npmConfigFilePath);
        const configContentWithoutRegistry = configContent
          .replaceAll(
            RegExp(`@genezio-sdk:registry=https://${GENEZIO_REGISTRY}/npm\n?`, "g"),
            ""
          )
          .replaceAll(RegExp(`//${GENEZIO_REGISTRY}/:_authToken=.*\n?`, "g"), "");
        updateNpmConfigPromise = fs.promises.writeFile(npmConfigFilePath, configContentWithoutRegistry);
    }

    return Promise.all([geneziorcPromise, updateNpmConfigPromise]);
}
