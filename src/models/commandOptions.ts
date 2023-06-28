export type GenezioLocalOptions = {
    port: number,
    logLevel?: string,
    installDeps: boolean,
}

export type GenezioDeployOptions = {
    backend?: boolean,
    frontend?: boolean,
    logLevel?: string,
    installDeps: boolean,
}