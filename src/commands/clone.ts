import { isLoggedIn } from "../utils/accounts.js";
import { downloadProject } from "../utils/downloadProject.js";
import { createTemporaryFolder } from "../utils/file.js";
import { debugLogger } from "../utils/logging.js";
import { loginCommand } from "./login.js";
import path from "path";
import decompress from "decompress";
import { getPresignedURLForProjectCodePull } from "../requests/getPresignedURLForProjectCodePull.js";

export async function cloneCommand(
    projectName: string,
    region: string,
    stage: string,
    projectPath: string,
) {
    // check if user is logged in
    if (!(await isLoggedIn())) {
        debugLogger.debug("No auth token found. Starting automatic authentication...");
        await loginCommand("", false);
    }

    // get the project presigned url
    const url = await getPresignedURLForProjectCodePull(region, projectName, stage);

    if (url === undefined) {
        debugLogger.debug("Failed to get presigned URL for project code push.");
        throw new Error("Failed to get URL for project code. Please open an issue on GitHub");
    }

    // download the project
    const tmpFolder = await createTemporaryFolder();

    // download the archive to the temporary folder
    debugLogger.debug(`Downloading project from ${url} to ${tmpFolder}`);
    await downloadProject(url, path.join(tmpFolder, "projectCode.zip")).catch((error) => {
        debugLogger.debug(`Failed to download project: ${error}`);
        throw new Error(
            "Failed to download project. Make sure the project exists and you have access to it.",
        );
    });

    // extract the project to the specified path
    debugLogger.debug(`Extracting project to ${projectPath}`);
    await decompress(path.join(tmpFolder, "projectCode.zip"), projectPath)
        .then(() => {
            debugLogger.debug(`Files extracted to ${projectPath}`);
        })
        .catch((error) => {
            debugLogger.debug(`Failed to extract files: ${error}`);
            throw new Error("Failed to extract files. Please open an issue on GitHub");
        });
}
