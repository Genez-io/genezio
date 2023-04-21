import { DeployCodeMethodResponse } from "../models/deployCodeResponse";
import { ProjectConfiguration } from "../models/projectConfiguration";

export type GenezioCloudInput = {
    name: string;
    archivePath: string;
    filePath: string
};

export type GenezioCloudResultClass = {
    className: string;
    methods: DeployCodeMethodResponse[];
    functionUrl: string;
    projectId: string;
};

export type GenezioCloudOutput = {
    classes: GenezioCloudResultClass[];
}

export interface CloudAdapter {
    deploy(input: GenezioCloudInput[], projectConfiguration: ProjectConfiguration): Promise<GenezioCloudOutput>;
}