import path from "path";
import { default as fsExtra } from "fs-extra";
import fsPromises from "fs/promises";
import fs from "fs";
import { createLocalTempFolder, deleteFolder } from "../../utils/file.js";
import { ClassUrlMap, replaceUrlsInSdk, writeSdkToDisk } from "../../utils/sdk.js";
import { getNodeModulePackageJson } from "../templates/packageJson.js";
import { compileSdk } from "../utils/compileSdk.js";
import { Language } from "../../yamlProjectConfiguration/models.js";
import { SdkGeneratorResponse } from "../../models/sdkGeneratorResponse.js";
import { getLinkPathsForProject } from "../../utils/linkDatabase.js";
import { debugLogger } from "../../utils/logging.js";
import { YamlFrontend } from "../../yamlProjectConfiguration/v1.js";
import { Options, Result, compareSync } from "dir-compare";

const POLLING_INTERVAL = 2000;

async function writeSdk(projectName: string, frontend: YamlFrontend|undefined, projectRegion: string, stage: string, sdkResponse: SdkGeneratorResponse, classUrls: ClassUrlMap[], publish: boolean, language: Language) {
    await replaceUrlsInSdk(
        sdkResponse,
        classUrls,
    );

    const localPath = await createLocalTempFolder(
        `${projectName}-${projectRegion}`,
    );
    const sdkPath = path.join(localPath, "sdk")
    await deleteFolder(sdkPath);
    await writeSdkToDisk(sdkResponse, sdkPath);
    const packageJson: string = getNodeModulePackageJson(
        /* packageName= */ `@genezio-sdk/${projectName}_${projectRegion}`,
        /* packageVersion= */ `1.0.0-${stage}`,
    );
    await compileSdk(sdkPath, packageJson, language, publish);

    if (stage === "local") {
        await watchNodeModules(
            projectName,
            projectRegion,
            frontend,
            sdkPath,
        );
    }
}

export async function writeSdkTs(projectName: string, frontend: YamlFrontend|undefined, projectRegion: string, stage: string, sdkResponse: SdkGeneratorResponse, classUrls: ClassUrlMap[], publish: boolean) {
    await writeSdk(projectName, frontend, projectRegion, stage, sdkResponse, classUrls, publish, Language.ts);
}

export async function writeSdkJs(projectName: string, frontend: YamlFrontend|undefined, projectRegion: string, stage: string, sdkResponse: SdkGeneratorResponse, classUrls: ClassUrlMap[], publish: boolean) {
    await writeSdk(projectName, frontend, projectRegion, stage, sdkResponse, classUrls, publish, Language.js);
}


async function watchNodeModules(
    projectName: string,
    projectRegion: string,
    frontend: YamlFrontend|undefined,
    sdkPath: string,
): Promise<NodeJS.Timeout> {
    // We are watching for the following files:
    // - node_modules/@genezio-sdk/<projectName>_<region>/package.json: this file is used to determine if the SDK was changed (by a npm install or npm update)
    // - node_modules/.package-lock.json: this file is used by npm to determine if it should update the packages or not. We are removing this file while "genezio local"
    // is running, because we are modifying node_modules folder manual (reference: https://github.com/npm/cli/blob/653769de359b8d24f0d17b8e7e426708f49cadb8/docs/content/configuring-npm/package-lock-json.md#hidden-lockfiles)
    const watchPaths: string[] = [];
    const sdkName = `${projectName}_${projectRegion}`;
    const nodeModulesSdkDirectoryPath = path.join("node_modules", "@genezio-sdk", sdkName);

    const frontends: YamlFrontend[] =  [];

    if (frontend && !Array.isArray(frontend)) {
        frontends.push(frontend);
    } else if (frontend) {
        frontends.push(...frontend);
    }

    for (const f of frontends) {
        watchPaths.push(path.join(f.path, nodeModulesSdkDirectoryPath));
        watchPaths.push(path.join(f.path, "node_modules", ".package-lock.json"));
    }

    const linkPaths = await getLinkPathsForProject(
        projectName,
        projectRegion,
    );
    for (const linkPath of linkPaths) {
        watchPaths.push(path.join(linkPath, nodeModulesSdkDirectoryPath));
        watchPaths.push(path.join(linkPath, "node_modules", ".package-lock.json"));
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
                    await writeSdkToNodeModules(projectName, projectRegion, frontends, sdkPath);
                }
            }
        }
    }, POLLING_INTERVAL);
}

async function writeSdkToNodeModules(
    projectName: string,
    projectRegion: string,
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
            await getLinkPathsForProject(
                projectName,
                projectRegion,
            ),
        );
    for (const frontendPath of frontendPaths) {
        const to = path.join(
            frontendPath,
            "node_modules",
            "@genezio-sdk",
            `${projectName}_${projectRegion}`,
        );

        await writeSdk(from, to).catch(() => {
            debugLogger.debug(`[WRITE_SDK_TO_NODE_MODULES] Error writing SDK to node_modules`);
        });
    }
}
