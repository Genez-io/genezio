import {
    DeployCodeFunctionResponse,
    DeployCodeMethodResponse,
} from "../models/deployCodeResponse.js";
import { MethodConfiguration, ProjectConfiguration } from "../models/projectConfiguration.js";
import { YamlFrontend } from "../projectConfiguration/yaml/v2.js";
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
          archiveName?: string;
          filePath: string;
          methods: MethodConfiguration[];
          dependenciesInfo?: Dependency[];
          allNonJsFilesPaths?: FileDetails[];
          unzippedBundleSize: number;
          entryFile: string;
      }
    | {
          type: GenezioCloudInputType.FUNCTION;
          name: string;
          archivePath: string;
          archiveName?: string;
          entryFile: string;
          unzippedBundleSize: number;
      };

export type GenezioCloudResultClass = {
    className: string;
    methods: DeployCodeMethodResponse[];
    functionUrl: string;
    projectId?: string;
};

export type GenezioCloudResultFunctions = {
    className: string;
    methods: DeployCodeMethodResponse[];
    functionUrl: string;
    projectId?: string;
};

export type GenezioCloudOutput = {
    projectId: string;
    projectEnvId: string;
    classes: GenezioCloudResultClass[];
    functions: DeployCodeFunctionResponse[];
};

export type CloudAdapterOptions = {
    stage?: string;
};

export interface CloudAdapter {
    deploy(
        input: GenezioCloudInput[],
        projectConfiguration: ProjectConfiguration,
        cloudAdapterOptions: CloudAdapterOptions,
        stack: string[],
        sourceRepository?: string,
    ): Promise<GenezioCloudOutput>;
    deployFrontend(
        projectName: string,
        projectRegion: string,
        frontend: YamlFrontend,
        stage: string,
    ): Promise<string>;
}
