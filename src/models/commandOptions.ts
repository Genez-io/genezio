import { Language } from "../yamlProjectConfiguration/models.js";
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

export interface GenezioLocalOptions extends BaseOptions {
    port: number;
    installDeps: boolean;
    env?: string;
    path?: string;
    language?: string;
    config: string;
    stage: string;
}

export interface GenezioDeployOptions extends BaseOptions {
    backend: boolean;
    frontend: boolean;
    installDeps: boolean;
    disableOptimization: boolean;
    env?: string;
    stage: string;
    subdomain?: string;
    config: string;
}

export interface GenezioListOptions extends BaseOptions {
    longListed: boolean;
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

export interface GenezioCreateNextJsOptions extends BaseOptions {
    name?: string;
    region?: string;
    path?: string;
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
      >);
