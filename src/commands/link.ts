import {
    deleteLinkPathForProject,
    deleteAllLinkPaths,
    setLinkPathForProject,
} from "../utils/linkDatabase.js";
import { log } from "../utils/logging.js";
import yamlConfigIOController from "../yamlProjectConfiguration/v2.js";

export async function linkCommand(projectName: string | undefined) {
    const cwd = process.cwd();
    let name = projectName;
    if (!name) {
        const projectConfiguration = await yamlConfigIOController.read();
        name = projectConfiguration.name;
    }

    await setLinkPathForProject(name, cwd);

    log.info("Successfully linked the path to your genezio project.");
}

export async function unlinkCommand(unlinkAll: boolean, projectName: string | undefined) {
    if (unlinkAll) {
        await deleteAllLinkPaths();
        return;
    }
    let name = projectName;
    if (!name) {
        const projectConfiguration = await yamlConfigIOController.read();
        name = projectConfiguration.name;
    }

    await deleteLinkPathForProject(name);

    if (unlinkAll) {
        log.info("Successfully unlinked all paths to your genezio projects.");
        return;
    }
    log.info("Successfully unlinked the path to your genezio project.");
}
