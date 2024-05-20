import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { Language } from "../yamlProjectConfiguration/models.js";
import zod from "zod";

export type LinkedFrontend = {
    path: string;
    language: Language;
};

async function getLinkContent(): Promise<Map<string, LinkedFrontend[]>> {
    const directoryPath = path.join(os.homedir(), ".genezio");
    const filePath = path.join(directoryPath, "geneziolinks");
    try {
        // Try to read the file
        const data = await fs.readFile(filePath, "utf8");
        // Parse the content as JSON and convert it as a Map
        const projectMap: Map<string, LinkedFrontend[]> = new Map(Object.entries(JSON.parse(data)));

        const linkedFrontendSchema = zod.object({
            path: zod.string(),
            language: zod.nativeEnum(Language),
        });
        for (const [projectName, linkedFrontends] of projectMap.entries()) {
            // Ignore values that do not match the `LinkedFrontend` schema, because they are most likely using an old version format
            projectMap.set(
                projectName,
                linkedFrontends.filter((f) => linkedFrontendSchema.safeParse(f).success),
            );
        }

        return projectMap;
    } catch (error) {
        const err = error as NodeJS.ErrnoException;
        if (err.code === "ENOENT" || err.code === "ENOTDIR") {
            await fs.mkdir(directoryPath, { recursive: true });
            // If the file doesn't exist, create it with an empty object
            await fs.writeFile(filePath, JSON.stringify({}), "utf8");
            return new Map<string, LinkedFrontend[]>();
        }

        // Rethrow the error if it's not because the file doesn't exist
        throw error;
    }
}

async function saveLinkContent(content: Map<string, LinkedFrontend[]>): Promise<void> {
    const directoryPath = path.join(os.homedir(), ".genezio");
    const filePath = path.join(directoryPath, "geneziolinks");

    await fs.writeFile(filePath, JSON.stringify(Object.fromEntries(content)), "utf8");
}

export async function getLinkedFrontendsForProject(projectName: string): Promise<LinkedFrontend[]> {
    const content = await getLinkContent();

    return content.get(projectName) || [];
}

export async function linkFrontendsToProject(
    projectName: string,
    frontends: LinkedFrontend[],
): Promise<void> {
    const content = await getLinkContent();
    const linkedFrontends = content.get(projectName) || [];

    for (const frontend of frontends) {
        // If the frontend is already linked don't add it twice
        if (
            linkedFrontends.find(
                (linked) => linked.path === frontend.path && linked.language === frontend.language,
            )
        ) {
            continue;
        }

        linkedFrontends.push(frontend);
    }

    content.set(projectName, linkedFrontends);
    await saveLinkContent(content);
}

export async function deleteAllLinkPaths(): Promise<void> {
    await saveLinkContent(new Map<string, LinkedFrontend[]>());
}

export async function deleteLinkPathForProject(projectName: string): Promise<void> {
    const content = await getLinkContent();

    content.delete(projectName);
    await saveLinkContent(content);
}
