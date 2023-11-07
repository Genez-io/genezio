import { DeployCodeMethodResponse } from "../models/deployCodeResponse.js";
import { MethodConfiguration, ProjectConfiguration } from "../models/projectConfiguration.js";
import { YamlFrontend } from "../models/yamlProjectConfiguration.js";

export type GenezioCloudInput = {
    name: string;
    archivePath: string;
    filePath: string;
    methods: MethodConfiguration[];
    dependenciesInfo: {
        name: string;
        path: string;
    };
    allNonJsFilesPaths: {
        name: string;
        extension: string;
        path: string;
        filePath: string;
    };
    filesSize: {
        name: string;
        totalSize: number;
    };

    unzippedBundleSize: number;
};

export type GenezioCloudResultClass = {
    className: string;
    methods: DeployCodeMethodResponse[];
    functionUrl: string;
    projectId?: string;
};

export type GenezioCloudOutput = {
    projectEnvId: string;
    classes: GenezioCloudResultClass[];
};

export type CloudAdapterOptions = {
    stage?: string;
};

export interface CloudAdapter {
    deploy(
        input: GenezioCloudInput[],
        projectConfiguration: ProjectConfiguration,
        cloudAdapterOptions: CloudAdapterOptions,
    ): Promise<GenezioCloudOutput>;
    deployFrontend(
        projectName: string,
        projectRegion: string,
        frontend: YamlFrontend,
        stage: string,
    ): Promise<string>;
}
