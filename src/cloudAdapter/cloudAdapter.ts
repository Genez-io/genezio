import {
    DeployCodeFunctionResponse,
    DeployCodeMethodResponse,
} from "../models/deployCodeResponse.js";
import { MethodConfiguration, ProjectConfiguration } from "../models/projectConfiguration.js";
import { YamlFrontend } from "../projectConfiguration/yaml/v2.js";
import { Dependency } from "../bundlers/bundler.interface.js";
import FileDetails from "../models/fileDetails.js";
import { InstanceSize } from "../projectConfiguration/yaml/models.js";
import { EnvironmentVariable } from "../models/environmentVariables.js";

export enum GenezioCloudInputType {
    CLASS = "class",
    FUNCTION = "function",
}

export type GenezioFunctionMetadata = ContainerMetadata | FunctionMetadata | PythonMetadata;
export enum GenezioFunctionMetadataType {
    Container = "container",
    Python = "python",
}

export type ContainerMetadata = {
    type: GenezioFunctionMetadataType.Container;
    cmd?: string;
    cwd?: string;
    http_port?: string;
    healthcheck_path?: string;
};

export type FunctionMetadata = {
    healthcheck_path?: string;
};

export type PythonMetadata = FunctionMetadata & {
    type: GenezioFunctionMetadataType.Python;
    app_name?: string;
};

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
          timeout?: number;
          storageSize?: number;
          instanceSize?: InstanceSize;
          vcpuCount?: number;
          memoryMb?: number;
          maxConcurrentRequestsPerInstance?: number;
          maxConcurrentInstances?: number;
          cooldownTime?: number;
          persistent?: boolean;
      }
    | {
          type: GenezioCloudInputType.FUNCTION;
          name: string;
          archivePath: string;
          archiveName?: string;
          entryFile: string;
          unzippedBundleSize: number;
          metadata?: GenezioFunctionMetadata;
          timeout?: number;
          storageSize?: number;
          instanceSize?: InstanceSize;
          vcpuCount?: number;
          memoryMb?: number;
          maxConcurrentRequestsPerInstance?: number;
          maxConcurrentInstances?: number;
          cooldownTime?: number;
          persistent?: boolean;
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
        environmentVariables?: EnvironmentVariable[],
    ): Promise<GenezioCloudOutput>;
    deployFrontend(
        projectName: string,
        projectRegion: string,
        frontend: YamlFrontend,
        stage: string,
    ): Promise<string>;
}
