import { Language } from "../projectConfiguration/yaml/models.js";
import { YamlFrontend } from "../projectConfiguration/yaml/v2.js";
import { default as fsExtra } from "fs-extra";
import fsPromises from "fs/promises";
import fs from "fs";
import path from "path";
import { debugLogger } from "../utils/logging.js";
import { Options, Result, compareSync } from "dir-compare";
import { deleteFolder } from "../utils/file.js";
import { getLinkedFrontendsForProject } from "../utils/linkDatabase.js";

const POLLING_INTERVAL = 2000;

export async function watchPackage(
    language: Language,
    projectName: string,
    frontends: YamlFrontend[] | undefined,
    sdkPath: string,
): Promise<NodeJS.Timeout | undefined> {
    switch (language) {
        case Language.js:
        case Language.ts:
            return watchNodeModules(projectName, frontends, sdkPath);
        default:
            return;
    }
}

async function watchNodeModules(
    projectName: string,
    frontends: YamlFrontend[] | undefined,
    sdkPath: string,
): Promise<NodeJS.Timeout | undefined> {
    // We are watching for the following files:
    // - node_modules/@genezio-sdk/<projectName>/package.json: this file is used to determine if the SDK was changed (by a npm install or npm update)
    // - node_modules/.package-lock.json: this file is used by npm to determine if it should update the packages or not. We are removing this file while "genezio local"
    // is running, because we are modifying node_modules folder manual (reference: https://github.com/npm/cli/blob/653769de359b8d24f0d17b8e7e426708f49cadb8/docs/content/configuring-npm/package-lock-json.md#hidden-lockfiles)
    const watchPaths: string[] = [];
    const sdkName = `${projectName}`;
    const nodeModulesSdkDirectoryPath = path.join("node_modules", "@genezio-sdk", sdkName);

    if (frontends) {
        for (const f of frontends) {
            watchPaths.push(path.join(f.path, nodeModulesSdkDirectoryPath));
            watchPaths.push(path.join(f.path, "node_modules", ".package-lock.json"));
        }
    }

    const linkedFrontends = (await getLinkedFrontendsForProject(projectName)).filter(
        (f) => f.language === Language.ts || f.language === Language.js,
    );
    for (const link of linkedFrontends) {
        watchPaths.push(path.join(link.path, nodeModulesSdkDirectoryPath));
        watchPaths.push(path.join(link.path, "node_modules", ".package-lock.json"));
    }

    return setInterval(async () => {
        for (const watchPath of watchPaths) {
            const components = watchPath.split(path.sep);

            // if the file is .package-lock.json, remove it
            if (
                components[components.length - 1] === ".package-lock.json" &&
                fs.existsSync(watchPath)
            ) {
                await fsPromises.unlink(watchPath).catch(() => {
                    debugLogger.debug(`[WATCH_NODE_MODULES] Error deleting ${watchPath}`);
                });
                return;
            }

            if (components[components.length - 1] === sdkName) {
                const genezioSdkPath = path.resolve(sdkPath, "..", "genezio-sdk");
                const options: Options = { compareContent: true };
                if (!fs.existsSync(watchPath)) {
                    fs.mkdirSync(watchPath, { recursive: true });
                }

                const res: Result = compareSync(genezioSdkPath, watchPath, options);
                if (!res.same) {
                    debugLogger.debug(`[WATCH_NODE_MODULES] Rewriting the SDK to node_modules...`);
                    await writeSdkToNodeModules(projectName, frontends ?? [], sdkPath);
                }
            }
        }
    }, POLLING_INTERVAL);
}

async function writeSdkToNodeModules(
    projectName: string,
    frontends: YamlFrontend[],
    originSdkPath: string,
) {
    const writeSdk = async (from: string, toFinal: string) => {
        if (fs.existsSync(toFinal)) {
            if (fs.lstatSync(toFinal).isSymbolicLink()) {
                fs.unlinkSync(toFinal);
            }
            await deleteFolder(toFinal);
        }
        fs.mkdirSync(toFinal, { recursive: true });

        await fsExtra.copy(from, toFinal, { overwrite: true });
    };

    const from = path.resolve(originSdkPath, "..", "genezio-sdk");

    // Write the SDK to the node_modules folder of each frontend
    // A frontend can be explicitly declared in the genezio.yaml file or it can be linked to the project
    const frontendPaths = (frontends || [])
        .map((f) => f.path)
        .concat(
            (await getLinkedFrontendsForProject(projectName))
                .filter((f) => f.language === Language.ts || f.language === Language.js)
                .map((f) => f.path),
        );
    for (const frontendPath of frontendPaths) {
        const to = path.join(frontendPath, "node_modules", "@genezio-sdk", `${projectName}`);

        await writeSdk(from, to).catch(() => {
            debugLogger.debug(`[WRITE_SDK_TO_NODE_MODULES] Error writing SDK to node_modules`);
        });
    }
}
