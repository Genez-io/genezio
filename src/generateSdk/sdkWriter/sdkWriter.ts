import { SdkGeneratorResponse } from "../../models/sdkGeneratorResponse.js";
import { ClassUrlMap } from "../../utils/sdk.js";
import { Language } from "../../yamlProjectConfiguration/models.js";
import { basicFileWriter } from "./basicFileWriter.js";
import { writeSdkTs, writeSdkJs } from "./jsSdkWriter.js";

type WriteSdkInput = {
    // The language of the SDK
    language: Language;
    // The name of the package
    packageName: string;
    // The version of the package or undefined if it is not defined. Defaults to 1.0.0-<stage>
    packageVersion: string | undefined;
    // The generated SDK
    sdkResponse: SdkGeneratorResponse;
    // A map between class names and their cloud URLs
    classUrls: ClassUrlMap[];
    // Whether to publish the package. If the language does not support "package SDK", this value is ignored.
    publish: boolean;
    // Whether to install the package. If the language does not support "package SDK", this value is ignored.
    installPackage: boolean;
    // The output path for the SDK if the SDK is written to disk.
    // If the language supports "package SDK" and the installPackage is true, the SDK will be written to a temporary folder and the output path will be ignored.
    // If the language supports "package SDK" and the installPackage is false, the SDK will be written to the output path.
    // If the language does not support "package SDK", the SDK will be written to the output path.
    // If the output path is undefined, the SDK will not be written to disk.
    outputPath: string | undefined;
};

/**
 * Write the SDK files to disk.
 * @param input - The input data
 * @returns The path of the written SDK or undefined if the writing was not performed.
 * @throws Error if the language is not supported
 */
export async function writeSdk(input: WriteSdkInput): Promise<string | undefined> {
    switch (input.language) {
        case Language.ts:
            return await writeSdkTs(
                input.packageName,
                input.packageVersion,
                input.sdkResponse,
                input.classUrls,
                input.publish,
                input.installPackage,
                input.outputPath,
            );
        case Language.js:
            return await writeSdkJs(
                input.packageName,
                input.packageVersion,
                input.sdkResponse,
                input.classUrls,
                input.publish,
                input.installPackage,
                input.outputPath,
            );
        case Language.go:
        case Language.kt:
        case Language.dart:
        case Language.swift:
        case Language.python:
            if (input.outputPath) {
                return await basicFileWriter(input.sdkResponse, input.classUrls, input.outputPath);
            }
            break;
        default:
            throw new Error(`Language ${input.language} is not supported`);
    }
}
