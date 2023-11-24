import { getProjectConfiguration } from "../utils/configuration.js";
import {
    deleteLinkPathForProject,
    deleteAllLinkPaths,
    setLinkPathForProject,
} from "../utils/linkDatabase.js";

export async function linkCommand() {
    const cwd = process.cwd();
    const projectConfiguration = await getProjectConfiguration("./genezio.yaml", true);

    await setLinkPathForProject(projectConfiguration.name, projectConfiguration.region, cwd);
}

export async function unlinkCommand(unlinkAll: boolean) {
    if (unlinkAll) {
        await deleteAllLinkPaths();
        return;
    }
    const projectConfiguration = await getProjectConfiguration("./genezio.yaml", true);

    await deleteLinkPathForProject(projectConfiguration.name, projectConfiguration.region);
}
