import { DeployCodeMethodResponse } from "../models/deployCodeResponse.js";
import { MethodConfiguration, ProjectConfiguration } from "../models/projectConfiguration.js";
import { YamlFrontend } from "../models/yamlProjectConfiguration.js";

export type GenezioCloudInput = {
  name: string;
  archivePath: string;
  filePath: string;
  methods: MethodConfiguration[];
  unzippedBundleSize: {
    totalSize: number;
    folderSize: {
      dependenciesSize: object;
      filesSize: object;
    };
  };
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

export type CloudAdapterOptions = {
    stage?: string;
}

export interface CloudAdapter {
    deploy(input: GenezioCloudInput[], projectConfiguration: ProjectConfiguration, cloudAdapterOptions: CloudAdapterOptions): Promise<GenezioCloudOutput>;
    deployFrontend(projectName: string, projectRegion: string, frontend: YamlFrontend, stage: string): Promise<string>;
}