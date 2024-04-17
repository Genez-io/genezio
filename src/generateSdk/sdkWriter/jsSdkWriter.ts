import path from "path";
import fs from "fs";
import { createLocalTempFolder, deleteFolder } from "../../utils/file.js";
import { ClassUrlMap, replaceUrlsInSdk, writeSdkToDisk } from "../../utils/sdk.js";
import { getNodeModulePackageJson } from "../templates/packageJson.js";
import { compileSdk } from "../utils/compileSdk.js";
import { Language } from "../../yamlProjectConfiguration/models.js";
import { SdkGeneratorResponse } from "../../models/sdkGeneratorResponse.js";
import { packageManagers, PackageManagerType } from "../../packageManagers/packageManager.js";

async function writeSdk(
    packageName: string,
    packageVersion: string | undefined,
    sdkResponse: SdkGeneratorResponse,
    classUrls: ClassUrlMap[],
    publish: boolean,
    language: Language.js | Language.ts,
    installPackage: boolean,
    outputPath: string | undefined,
    exportAsTarball: boolean,
): Promise<string> {
    await replaceUrlsInSdk(sdkResponse, classUrls);

    const localPath = await createLocalTempFolder(packageName.replace("@", "").replace("/", "_"));
    const sdkPath = path.join(localPath, "sdk");
    await deleteFolder(sdkPath);
    await writeSdkToDisk(sdkResponse, sdkPath);
    const packageJson = getNodeModulePackageJson(packageName, packageVersion);

    // If installPackage is true, we will bundle the SDK in a temp folder and we'll handle the installation from there
    // Otherwise, we will bundle the SDK in the outputPath folder and the user will have to install it manually
    if (installPackage) {
        await compileSdk(sdkPath, packageJson, language, publish);
    } else {
        if (exportAsTarball) {
            const absoluteOutputPath = path.resolve(outputPath!);
            if (!fs.existsSync(absoluteOutputPath)) {
                fs.mkdirSync(absoluteOutputPath, { recursive: true });
            }
            const sdkCompiledPath = await compileSdk(sdkPath, packageJson, language, publish);
            await packageManagers[PackageManagerType.npm].pack(sdkCompiledPath, absoluteOutputPath);
        } else {
            await compileSdk(sdkPath, packageJson, language, publish, outputPath);
        }
    }

    return sdkPath;
}

export async function writeSdkTs(
    packageName: string,
    packageVersion: string | undefined,
    sdkResponse: SdkGeneratorResponse,
    classUrls: ClassUrlMap[],
    publish: boolean,
    installPackage: boolean,
    path: string | undefined,
    exportAsTarball: boolean = false,
): Promise<string> {
    return await writeSdk(
        packageName,
        packageVersion,
        sdkResponse,
        classUrls,
        publish,
        Language.ts,
        installPackage,
        path,
        exportAsTarball,
    );
}

export async function writeSdkJs(
    projectName: string,
    projectRegion: string | undefined,
    sdkResponse: SdkGeneratorResponse,
    classUrls: ClassUrlMap[],
    publish: boolean,
    installPackage: boolean,
    path: string | undefined,
    exportAsTarball: boolean = false,
): Promise<string> {
    return await writeSdk(
        projectName,
        projectRegion,
        sdkResponse,
        classUrls,
        publish,
        Language.js,
        installPackage,
        path,
        exportAsTarball,
    );
}
