export type GenezioLocalOptions = {
    port: number;
    logLevel?: string;
    installDeps: boolean;
    env?: string;
    path?: string;
    language?: string;
};

export type GenezioDeployOptions = {
    backend?: boolean;
    frontend?: boolean;
    logLevel?: string;
    installDeps: boolean;
    env?: string;
    stage?: string;
    subdomain?: string;
};
