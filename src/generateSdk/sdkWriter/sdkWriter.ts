
import { SdkGeneratorResponse } from '../../models/sdkGeneratorResponse.js';
import { ClassUrlMap } from '../../utils/sdk.js';
import { Language } from '../../yamlProjectConfiguration/models.js';
import { basicFileWriter } from './basicFileWriter.js';
import { writeSdkTs, writeSdkJs } from './jsSdkWriter.js';

export async function writeSdk(
    language: Language, 
    projectName: string, 
    projectRegion: string,
    stage: string,
    sdkResponse: SdkGeneratorResponse,
    classUrls: ClassUrlMap[],
    publish: boolean, 
    outputPath: string|undefined): Promise<string> {
    switch (language) {
        case Language.ts:
            return await writeSdkTs(projectName, projectRegion, stage, sdkResponse, classUrls, publish, outputPath);
        case Language.js:
            return await writeSdkJs(projectName, projectRegion, stage, sdkResponse, classUrls, publish, outputPath);
        case Language.go:
        case Language.kt:
        case Language.dart:
        case Language.swift:
        case Language.python:
            return await basicFileWriter(sdkResponse, outputPath!);
        default:
            throw new Error(`Language ${language} is not supported`);
    }
}
