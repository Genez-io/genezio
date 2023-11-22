import { getProjectConfiguration } from "../utils/configuration.js";
import { deleteLinkPathForProject, setLinkPathForProject } from "../utils/linkDatabase.js";

export async function linkCommand() {
    const cwd = process.cwd();
    const projectConfiguration = await getProjectConfiguration();

    setLinkPathForProject(projectConfiguration.name, projectConfiguration.region, cwd);
}

export async function unlinkCommand() {
    const projectConfiguration = await getProjectConfiguration();

    deleteLinkPathForProject(projectConfiguration.name, projectConfiguration.region);
}
