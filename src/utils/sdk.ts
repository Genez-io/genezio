import { DeployCodeResponse } from "../models/deployCodeResponse"
import { GenerateSdkResponse } from "../models/generateSdkResponse"
import { Language } from "../models/yamlProjectConfiguration"
import { writeToFile } from "./file"
import { debugLogger } from "./logging"
import log from "loglevel";

export type ClassUrlMap = {
    name: string
    cloudUrl: string
}

/**
 * Replace the temporary markdowns from the SDK with actual URLs.
 */
export async function replaceUrlsInSdk(sdkResponse: GenerateSdkResponse, classUrlMap: ClassUrlMap[]) {
    sdkResponse.classFiles.forEach((c) => {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const classContent = classUrlMap.find((classFile) => {
            return classFile.name === c.name
        })!

        c.implementation = c.implementation.replace("%%%link_to_be_replace%%%", classContent.cloudUrl)
    })
}

/**
 * Write the SDK files to disk.
 */
export async function writeSdkToDisk(sdk: GenerateSdkResponse, language: Language, outputPath: string) {
    if (sdk.classFiles.length == 0) {
        debugLogger.debug("No SDK classes found...")
        return 
    }
    let extension: string = language as string;
    if (language === Language.python) {
        extension = "py"
    }

    debugLogger.debug("Writing the SDK to files...")
    if (sdk.remoteFile) {
        await writeToFile(
            outputPath,
            `remote.${extension}`,
            sdk.remoteFile,
            true
        ).catch((error) => {
            log.error(error.toString());
        });
    }

    await Promise.all(
        sdk.classFiles.map((classFile: any) => {
            let filename;
            if (language === Language.python) {
                filename = `${classFile.name}.${extension}`
            } else {
                filename = `${classFile.name}.sdk.${extension}`
            }
            filename = filename.charAt(0).toLowerCase() + filename.slice(1)
            return writeToFile(
                outputPath,
                filename,
                classFile.implementation,
                true
            );
        })
    );
    debugLogger.debug("The SDK was successfully written to files.")
}