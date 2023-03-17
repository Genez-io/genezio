import { SdkGeneratorResponse } from "../models/SdkGeneratorResponse"
import { Language } from "../models/yamlProjectConfiguration"
import { writeToFile } from "./file"
import { debugLogger } from "./logging"
import { File } from "../models/genezio-models"

export type ClassUrlMap = {
    name: string
    cloudUrl: string
}

/**
 * Replace the temporary markdowns from the SDK with actual URLs.
 */
export async function replaceUrlsInSdk(sdkResponse: SdkGeneratorResponse, classUrlMap: ClassUrlMap[]) {
    sdkResponse.files.forEach((c : File) => {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const classContent = classUrlMap.find((classFile) => {
            return classFile.name === c.path
        })!

        c.data = c.data.replace("%%%link_to_be_replace%%%", classContent.cloudUrl)
    })
}

/**
 * Write the SDK files to disk.
 */
export async function writeSdkToDisk(sdk: SdkGeneratorResponse, language: Language, outputPath: string) {
    if (sdk.files.length == 0) {
        debugLogger.debug("No SDK classes found...")
        return 
    }

    debugLogger.debug("Writing the SDK to files...")
    await Promise.all(
        sdk.files.map((file: File) => {
            console.log(file.path)
            console.log(file.data)
            
            return writeToFile(
                outputPath,
                file.path,
                file.data,
                true
            );
        })
    );
    debugLogger.debug("The SDK was successfully written to files.")
}