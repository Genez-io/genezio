
import { SdkGeneratorResponse } from '../../models/sdkGeneratorResponse.js';
import { ClassUrlMap } from '../../utils/sdk.js';
import { Language } from '../../yamlProjectConfiguration/models.js';
import { YamlFrontend } from '../../yamlProjectConfiguration/v1.js';
import { basicFileWriter } from './basicFileWriter.js';
import { writeSdkTs, writeSdkJs } from './jsSdkWriter.js';

export async function writeSdk(language: Language, frontend: YamlFrontend|undefined, projectName: string, projectRegion: string, stage: string, sdkResponse: SdkGeneratorResponse, classUrls: ClassUrlMap[], publish: boolean, path: string|undefined) {
    switch (language) {
        case Language.ts:
            writeSdkTs(projectName, frontend, projectRegion, stage, sdkResponse, classUrls, publish);
            break;
        case Language.js:
            writeSdkJs(projectName, frontend, projectRegion, stage, sdkResponse, classUrls, publish);
            break;
        case Language.go:
        case Language.kt:
        case Language.dart:
        case Language.swift:
        case Language.python:
            basicFileWriter(sdkResponse, path!);
            break;

    }
}
