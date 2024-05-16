import path from "path";
import { UserError } from "../errors.js";
import {
    deleteLinkPathForProject,
    deleteAllLinkPaths,
    linkFrontendsToProject,
    LinkedFrontend,
} from "../utils/linkDatabase.js";
import { log } from "../utils/logging.js";
import yamlConfigIOController, {
    YamlProjectConfiguration,
} from "../yamlProjectConfiguration/v2.js";
import { Language } from "../yamlProjectConfiguration/models.js";
import zod from "zod";

async function getProjectConfiguration(): Promise<YamlProjectConfiguration> {
    const projectConfiguration = await yamlConfigIOController.read().catch((_error) => {
        throw new UserError(
            "Command execution failed. Please ensure you are running this command from a directory containing 'genezio.yaml' or provide the [projectName] and [language] arguments.",
        );
    });

    return projectConfiguration;
}

export async function linkCommand(
    projectName: string | undefined,
    projectLanguage: string | undefined,
) {
    const frontends: LinkedFrontend[] = [];
    if (!projectName || !projectLanguage) {
        // Read YAML configuration
        const projectConfiguration = await getProjectConfiguration();

        // Link only frontends that need a generated SDK
        for (const frontend of projectConfiguration.frontend || []) {
            if (frontend.sdk) {
                frontends.push({
                    path: path.join(process.cwd(), frontend.path),
                    language: frontend.sdk.language,
                });
            }
        }

        // Set the project name
        projectName = projectConfiguration.name;
    } else {
        const parsedLanguage = zod.nativeEnum(Language).safeParse(projectLanguage);
        if (!parsedLanguage.success) {
            throw new UserError(
                `There was an error parsing the provided language: ${parsedLanguage.error.issues[0].message}`,
            );
        }

        frontends.push({ path: process.cwd(), language: parsedLanguage.data });
    }

    await linkFrontendsToProject(projectName, frontends);

    log.info("Successfully linked the path to your genezio project.");
}

export async function unlinkCommand(unlinkAll: boolean, projectName: string | undefined) {
    if (unlinkAll) {
        await deleteAllLinkPaths();
        return;
    }
    let name = projectName;
    if (!name) {
        name = (await getProjectConfiguration()).name;
    }

    await deleteLinkPathForProject(name);

    if (unlinkAll) {
        log.info("Successfully unlinked all paths to your genezio projects.");
        return;
    }
    log.info("Successfully unlinked the path to your genezio project.");
}
