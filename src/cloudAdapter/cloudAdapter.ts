import { DeployCodeMethodResponse } from "../models/deployCodeResponse";
import { MethodConfiguration, ProjectConfiguration } from "../models/projectConfiguration";
import { YamlFrontend } from "../models/yamlProjectConfiguration";

export type GenezioCloudInput = {
    name: string;
    archivePath: string;
    filePath: string
    methods: MethodConfiguration[];
};

export type GenezioCloudResultClass = {
    className: string;
    methods: DeployCodeMethodResponse[];
    functionUrl: string,
    projectId?: string;
};

export type GenezioCloudOutput = {
    classes: GenezioCloudResultClass[];
}

export interface CloudAdapter {
    deploy(input: GenezioCloudInput[], projectConfiguration: ProjectConfiguration): Promise<GenezioCloudOutput>;
    deployFrontend(projectName: string, projectRegion: string, frontend: YamlFrontend): Promise<string>;
}