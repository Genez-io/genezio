import { readUTF8File, writeToFile } from "./file.js";
import os from "os";
import path from "path";
import fs from "fs";
import { debugLogger } from "./logging.js";
import { GENEZIO_REGISTRY } from "../constants.js";
import {
    packageManagers,
    PackageManagerType,
    supportedRegistryPackageManagers,
} from "../packageManagers/packageManager.js";
import getUser from "../requests/getUser.js";
import { UserError } from "../errors.js";

export async function getAuthToken(): Promise<string | undefined> {
    // Check if GENEZIO_TOKEN is set
    if (process.env["GENEZIO_TOKEN"]) {
        debugLogger.debug(
            "Using GENEZIO_TOKEN to authenticate because it's defined in this environment",
        );
        const result = process.env["GENEZIO_TOKEN"].trim();
        return result;
    }
    const homeDirectory = os.homedir();
    const loginConfigFilePath = path.join(homeDirectory, ".geneziorc");
    try {
        const result = await readUTF8File(loginConfigFilePath);
        return result.trim();
    } catch (error) {
        debugLogger.debug(`An error occurred during getAuthToken ${error}`);
        return undefined;
    }
}

export async function isLoggedIn(): Promise<boolean> {
    try {
        await getUser();
        return true;
    } catch (error) {
        if (process.env["GENEZIO_TOKEN"]) {
            throw new UserError("GENEZIO_TOKEN is set but it's invalid. Please check your token.");
        }
        return false;
    }
}

export async function setupScopedRepositoryAuth(token: string) {
    const packageManagerList = Object.values(packageManagers);
    const addScopedRegistriesPromises = packageManagerList
        .filter((packageManager) =>
            supportedRegistryPackageManagers.includes(packageManager.command as PackageManagerType),
        )
        .map((packageManager) => packageManager.addScopedRegistry(GENEZIO_REGISTRY, token));

    await Promise.allSettled(addScopedRegistriesPromises).then((results) => {
        results.forEach((result, i) => {
            if (result.status === "rejected") {
                debugLogger.debug(
                    `${packageManagerList[i].command} scoped registry set failed: ${result.reason}`,
                );
            }
        });
    });
}

export async function saveAuthToken(token: string) {
    const homeDirectory = os.homedir();
    const loginConfigFile = ".geneziorc";

    // Add token to .geneziorc file
    await writeToFile(homeDirectory, loginConfigFile, token, true);

    // Add scoped registry to all package managers configuration file
    await setupScopedRepositoryAuth(token);
}

export async function removeAuthToken() {
    const homeDirectory = os.homedir();
    const loginConfigFilePath = path.join(homeDirectory, ".geneziorc");

    const geneziorcPromise: Promise<void> = new Promise((resolve, reject) => {
        fs.unlink(loginConfigFilePath, (error) => {
            if (error) {
                reject(error);
            }

            resolve();
        });
    });

    const removeScopedRegistryPromises = Object.values(packageManagers).map((packageManager) =>
        packageManager.removeScopedRegistry("genezio-sdk"),
    );

    return Promise.allSettled([geneziorcPromise, ...removeScopedRegistryPromises]);
}
