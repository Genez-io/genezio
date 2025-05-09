import { Language } from "../projectConfiguration/yaml/models.js";
import { CloudAdapterIdentifier } from "./cloudProviderIdentifier.js";

export interface BaseOptions {
    logLevel?: string;
}

export interface GenezioBundleOptions extends BaseOptions {
    className: string;
    output: string;
    disableOptimization: boolean;
    cloudAdapter?: CloudAdapterIdentifier;
}

export interface GenezioBundleFunctionOptions extends BaseOptions {
    functionName: string;
    output: string;
    cloudAdapter?: CloudAdapterIdentifier;
    handler?: string;
    entry?: string;
    functionPath?: string;
    backendPath?: string;
}

export interface GenezioLocalOptions extends BaseOptions {
    port: number;
    installDeps: boolean;
    env?: string;
    path?: string;
    language?: string;
    config: string;
    stage: string;
}

export interface GenezioAnalyzeOptions extends BaseOptions {
    region: string;
    config: string;
    force: boolean;
    name?: string;
    format?: string;
}

export interface GenezioDeployOptions extends BaseOptions {
    backend: boolean;
    frontend: boolean;
    name?: string;
    installDeps: boolean;
    disableOptimization: boolean;
    env?: string;
    stage: string;
    subdomain?: string;
    config: string;
    image?: string;
    zip?: string;
}

export interface GenezioListOptions extends BaseOptions {
    longListed: boolean;
    format: string;
}

export interface GenezioDeleteOptions extends BaseOptions {
    force: boolean;
    stage?: string;
}

export enum SourceType {
    LOCAL = "local",
    REMOTE = "remote",
}

export interface GenezioSdkOptions extends BaseOptions {
    source: SourceType;
    config: string;
    language: Language;
    output: string;
    stage: string;
    region: string;
    url?: string;
    packageName: string;
    packageVersion: string;
    tarball: boolean;
}

export interface GenezioCloneOptions extends BaseOptions {
    name: string;
    region: string;
    stage: string;
}

export interface GenezioUnlinkOptions extends BaseOptions {
    all: boolean;
}

export interface GenezioEnvOptions extends BaseOptions {
    projectName: string;
    output: string;
    stage?: string;
    format?: string;
}

export interface GenezioDatabaseOptions extends BaseOptions {
    id?: string;
    name?: string;
    config?: string;
    action?: string;
}

export interface GenezioCreateInteractiveOptions extends BaseOptions {
    path?: string;
}

export interface GenezioCreateFullstackOptions extends BaseOptions {
    name?: string;
    region?: string;
    multirepo: boolean;
    backend?: string;
    frontend?: string;
    path?: string;
}

export interface GenezioCreateBackendOptions extends BaseOptions {
    name?: string;
    region?: string;
    backend?: string;
    path?: string;
}

export interface GenezioCreateExpressJsOptions extends BaseOptions {
    name?: string;
    region?: string;
    path?: string;
}
export interface GenezioCreateNitroJsOptions extends BaseOptions {
    name?: string;
    region?: string;
    path?: string;
}

export interface GenezioCreateNextJsOptions extends BaseOptions {
    name?: string;
    region?: string;
    path?: string;
    default: boolean;
}

export interface GenezioCreateServerlessFunctionOptions extends BaseOptions {
    name?: string;
    region?: string;
    path?: string;
}

export type GenezioCreateOptions =
    | ({ type: "fullstack"; path?: string } & Required<
          Omit<GenezioCreateFullstackOptions, "path" | "logLevel">
      >)
    | ({ type: "backend"; path?: string } & Required<
          Omit<GenezioCreateBackendOptions, "path" | "logLevel">
      >)
    | ({ type: "expressjs"; path?: string } & Required<
          Omit<GenezioCreateExpressJsOptions, "path" | "logLevel">
      >)
    | ({ type: "nextjs"; path?: string } & Required<
          Omit<GenezioCreateNextJsOptions, "path" | "logLevel">
      >)
    | ({ type: "serverless"; path?: string } & Required<
          Omit<GenezioCreateServerlessFunctionOptions, "path" | "logLevel">
      >)
    | ({ type: "nitrojs"; path?: string } & Required<
          Omit<GenezioCreateNitroJsOptions, "path" | "logLevel">
      >)
    | ({ type: "nuxt"; path?: string } & Required<
          Omit<GenezioCreateNitroJsOptions, "path" | "logLevel">
      >);
