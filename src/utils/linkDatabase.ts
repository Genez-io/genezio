import { promises as fs } from "fs";
import os from "os";
import path from "path";

async function getLinkContent(): Promise<Map<string, string[]>> {
    const directoryPath = path.join(os.homedir(), ".genezio");
    const filePath = path.join(directoryPath, "geneziolinks");
    try {
        // Try to read the file
        const data = await fs.readFile(filePath, "utf8");
        // Parse the content as JSON and return as a Map
        return new Map(Object.entries(JSON.parse(data)));
    } catch (error: any) {
        if (error.code === "ENOENT" || error.code === "ENOTDIR") {
            await fs.mkdir(directoryPath, { recursive: true });
            // If the file doesn't exist, create it with an empty object
            await fs.writeFile(filePath, JSON.stringify({}), "utf8");
            return new Map<string, string[]>();
        }
        // Rethrow the error if it's not because the file doesn't exist
        throw error;
    }
}

export async function getLinkPathsForProject(
    projectName: string,
    region: string,
): Promise<string[]> {
    const content = await getLinkContent();
    const key = `${projectName}:${region}`;
    return content.get(key) || [];
}

export async function setLinkPathForProject(
    projectName: string,
    region: string,
    linkPath: string,
): Promise<void> {
    const content = await getLinkContent();
    const key = `${projectName}:${region}`;
    const paths = content.get(key) || [];
    if (paths.includes(linkPath)) {
        return;
    }
    paths.push(linkPath);
    content.set(key, paths);
    await saveLinkContent(content);
}

export async function deleteAllLinkPaths(): Promise<void> {
    await saveLinkContent(new Map<string, string[]>());
}

export async function deleteLinkPathForProject(projectName: string, region: string): Promise<void> {
    const content = await getLinkContent();
    const key = `${projectName}:${region}`;
    content.delete(key);
    await saveLinkContent(content);
}

async function saveLinkContent(content: Map<string, string[]>): Promise<void> {
    const directoryPath = path.join(os.homedir(), ".genezio");
    const filePath = path.join(directoryPath, "geneziolinks");
    await fs.writeFile(filePath, JSON.stringify(Object.fromEntries(content)), "utf8");
}
