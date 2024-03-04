import path from "path";
import { createLocalTempFolder, deleteFolder } from "../../utils/file.js";
import { ClassUrlMap, replaceUrlsInSdk, writeSdkToDisk } from "../../utils/sdk.js";
import { getNodeModulePackageJson } from "../templates/packageJson.js";
import { compileSdk } from "../utils/compileSdk.js";
import { Language } from "../../yamlProjectConfiguration/models.js";
import { SdkGeneratorResponse } from "../../models/sdkGeneratorResponse.js";


async function writeSdk(
    projectName: string,
    projectRegion: string,
    stage: string,
    sdkResponse: SdkGeneratorResponse,
    classUrls: ClassUrlMap[],
    publish: boolean,
    language: Language,
    outputPath: string|undefined): Promise<string> {
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
    let packageJson: string;

    if (stage === "local") {
        packageJson = getNodeModulePackageJson(
         /* packageName= */ `@genezio-sdk/${projectName}_${projectRegion}`
        );
    } else {
        packageJson = getNodeModulePackageJson(
         /* packageName= */ `@genezio-sdk/${projectName}_${projectRegion}`,
         /* version= */ `1.0.0-${stage}`, 
        );
    }
    console.log({outputPath});
    await compileSdk(sdkPath, packageJson, language, publish, outputPath);

    return sdkPath;
}

export async function writeSdkTs(
    projectName: string,
    projectRegion: string,
    stage: string,
    sdkResponse: SdkGeneratorResponse,
    classUrls: ClassUrlMap[],
    publish: boolean,
    path: string|undefined): Promise<string> {
    return await writeSdk(projectName, projectRegion, stage, sdkResponse, classUrls, publish, Language.ts, path);
}

export async function writeSdkJs(
    projectName: string,
    projectRegion: string,
    stage: string,
    sdkResponse: SdkGeneratorResponse,
    classUrls: ClassUrlMap[],
    publish: boolean,
    path: string|undefined): Promise<string> {
    return await writeSdk(projectName, projectRegion, stage, sdkResponse, classUrls, publish, Language.js, path);
}


