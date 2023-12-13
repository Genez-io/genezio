export interface BaseOptions {
    logLevel?: string;
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
    local,
    remote,
}

export interface GenezioSdkOptions extends BaseOptions {
    source: SourceType;
    config: string;
    language: string;
    path: string;
    stage: string;
    region: string;
    url: string;
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
