import { DeployCodeMethodResponse } from "../models/deployCodeResponse.js";
import { MethodConfiguration, ProjectConfiguration } from "../models/projectConfiguration.js";
import { YamlFrontend } from "../yamlProjectConfiguration/v2.js";
import { Dependency } from "../bundlers/bundler.interface.js";
import FileDetails from "../models/fileDetails.js";

export enum GenezioCloudInputType {
    CLASS = "class",
    FUNCTION = "function",
}

export type GenezioCloudInput =
    | {
          type: GenezioCloudInputType.CLASS;
          name: string;
          archivePath: string;
          filePath: string;
          methods: MethodConfiguration[];
          dependenciesInfo?: Dependency[];
          allNonJsFilesPaths?: FileDetails[];
          unzippedBundleSize: number;
      }
    | {
          type: GenezioCloudInputType.FUNCTION;
          name: string;
          archivePath: string;
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
