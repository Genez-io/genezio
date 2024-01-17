import { regions } from "../utils/configs.js";
import { Language } from "./yamlProjectConfiguration.js";

export interface BaseOptions {
    logLevel?: string;
}

export interface GenezioBundleOptions extends BaseOptions {
    className: string;
    output: string;
}

export interface GenezioLocalOptions extends BaseOptions {
    port: number;
    installDeps: boolean;
    env?: string;
    path?: string;
    language?: string;
}

export interface GenezioDeployOptions extends BaseOptions {
    backend?: boolean;
    frontend?: boolean;
    installDeps: boolean;
    env?: string;
    stage?: string;
    subdomain?: string;
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

export enum SdkType {
    PACKAGE = "package",
    CLASSIC = "classic",
}

export interface GenezioSdkOptions extends BaseOptions {
    source: SourceType;
    type: SdkType;
    config: string;
    language: Language;
    output: string;
    stage: string;
    region: string;
    url?: string;
}

export interface GenezioLinkOptions extends BaseOptions {
    projectName?: string;
    region?: string;
}

export interface GenezioUnlinkOptions extends BaseOptions {
    all: boolean;
    projectName?: string;
    region?: string;
}

export interface GenezioCreateBaseOptions extends BaseOptions {
    name: string;
    region: (typeof regions)[number]["value"];
}

export type GenezioCreateOptions = GenezioCreateBaseOptions &
    (
        | { backend: string }
        | { frontend: string }
        | { fullstack: [string, string]; structure: "monorepo" | "multirepo" }
    );
