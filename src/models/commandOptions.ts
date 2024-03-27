import { Language } from "../yamlProjectConfiguration/models.js";
import { CloudAdapterIdentifier } from "./cloudProviderIdentifier.js";

export interface BaseOptions {
    logLevel?: string;
}

export interface GenezioBundleOptions extends BaseOptions {
    className: string;
    output: string;
    cloudAdapter?: CloudAdapterIdentifier;
}

export interface GenezioLocalOptions extends BaseOptions {
    port: number;
    installDeps: boolean;
    env?: string;
    path?: string;
    language?: string;
    config: string;
}

export interface GenezioDeployOptions extends BaseOptions {
    backend: boolean;
    frontend: boolean;
    installDeps: boolean;
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
}

export interface GenezioLinkOptions extends BaseOptions {
    projectName?: string;
}

export interface GenezioUnlinkOptions extends BaseOptions {
    all: boolean;
    projectName?: string;
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

export type GenezioCreateOptions =
    | ({ type: "fullstack"; path?: string } & Required<
          Omit<GenezioCreateFullstackOptions, "path" | "logLevel">
      >)
    | ({ type: "backend"; path?: string } & Required<
          Omit<GenezioCreateBackendOptions, "path" | "logLevel">
      >);
