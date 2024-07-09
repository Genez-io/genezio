import fs from "fs";
import path from "path";
import { CreateFrontendV2Origin } from "../../../requests/createFrontendProject.js";

/**
 * Computes the paths that the assets should be served at. It will check if the assets and route entries clash. If
 * they do, it will generate a specific path for the assets, else it will generate a wildcard path. This way, there
 * will be no case where the route entry is not served because the assets entry was too broad.
 *
 * @param assetsFolder - The path to the assets folder
 * @param origin - The origin of the frontend
 * @returns The paths that the assets should be served at
 */
export async function computeAssetsPaths(assetsFolder: string, origin: CreateFrontendV2Origin) {
    const assets = await treeFs(assetsFolder);
    if (!assets) {
        return [];
    }

    let routes: FsEntry;
    if (fs.existsSync("app") || fs.existsSync("pages")) {
        routes = await mergeFsTrees(await treeFs("app"), await treeFs("pages"));
    } else if (fs.existsSync("src/app") || fs.existsSync("src/pages")) {
        routes = await mergeFsTrees(await treeFs("src/app"), await treeFs("src/pages"));
    } else {
        routes = new Directory();
    }

    const paths = recursivePathGenerator(assets, routes);
    return paths.map((p) => ({ origin, pattern: p }));
}

export type FsEntry = Directory | File;
export class File {}
export class Directory {
    constructor(public children: Map<string, Directory | File> = new Map()) {}
}

/**
 * Recursively reads the file system and creates a tree of directories and files.
 *
 * @param fsPath - The path to the directory to read
 * @returns The root directory of the tree or undefined if the path does not exist
 */
export async function treeFs(fsPath: string): Promise<FsEntry | undefined> {
    if (!fs.existsSync(fsPath)) {
        return undefined;
    }

    if (!(await fs.promises.stat(fsPath)).isDirectory()) {
        return new File();
    }

    const dir = new Directory();

    await Promise.all(
        (await fs.promises.readdir(fsPath)).map(async (file) => {
            const fileStat = await fs.promises.stat(path.join(fsPath, file));

            if (fileStat.isDirectory()) {
                dir.children.set(file, (await treeFs(path.join(fsPath, file)))!);
            } else {
                dir.children.set(file, new File());
            }
        }),
    );

    return dir;
}

/**
 * Merges two file system trees together.
 *
 * @param root - The root of the first tree
 * @param add - The root of the second tree
 * @returns The merged tree
 */
export async function mergeFsTrees(
    root: FsEntry | undefined,
    add: FsEntry | undefined,
): Promise<FsEntry> {
    if (!root && !add) {
        return new Directory();
    } else if (!root && add) {
        return add;
    } else if (!add && root) {
        return root;
    }

    const rootCopy = structuredClone(root!);

    if (rootCopy instanceof File || add instanceof File) {
        return rootCopy;
    }

    for (const [name, entry] of add!.children) {
        if (entry instanceof File) {
            rootCopy.children.set(name, entry);
            continue;
        }

        const existing = rootCopy.children.get(name);
        if (!existing) {
            rootCopy.children.set(name, entry);
            continue;
        }

        rootCopy.children.set(name, await mergeFsTrees(existing, entry));
    }

    return rootCopy;
}

/**
 * Recursively checks if the assets and route entires clash. If they do, it will generate a specific path for the
 * assets, else it will generate a wildcard path. This way, there will be no case where the route entry is not
 * served because the assets entry was too broad.
 *
 * @param assetsEntry - FsEntry of the assets folder
 * @param routeEntry - FsEntry of the route (app, pages, src/app, src/pages) folder
 * @param currentPath - The current path in the assets folder, used for recursion
 * @param paths - The paths that have been generated so far, used for recursion
 * @returns The paths that the assets should be served at
 */
export function recursivePathGenerator(
    assetsEntry: FsEntry,
    routeEntry: FsEntry,
    currentPath: string = "",
    paths: string[] = [],
): string[] {
    if (assetsEntry instanceof File) {
        return paths;
    }

    for (const [name, entry] of assetsEntry.children) {
        if (entry instanceof File) {
            paths.push([currentPath, name].join("/"));
            continue;
        }
        if (routeEntry instanceof File) {
            continue;
        }

        if (
            routeEntry.children.has(name) ||
            [...routeEntry.children.keys()].some((e) => e.startsWith("[") && e.endsWith("]"))
        ) {
            recursivePathGenerator(
                assetsEntry.children.get(name) as Directory,
                routeEntry.children.get(name) as Directory,
                [currentPath, name].join("/"),
                paths,
            );
        } else {
            paths.push([currentPath, name, "*"].join("/"));
        }
    }

    return paths;
}
