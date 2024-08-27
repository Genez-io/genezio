export enum Language {
    js = "js",
    ts = "ts",
    swift = "swift",
    python = "python",
    dart = "dart",
    kt = "kt",
    go = "go",
}

export enum AuthenticationDatabaseType {
    mongo = "mongodb",
    postgres = "postgresql",
}

export enum DatabaseType {
    neon = "postgres-neon",
}

export enum TriggerType {
    jsonrpc = "jsonrpc",
    cron = "cron",
    http = "http",
}
export enum AuthenticationEmailTemplateType {
    passwordReset = "PASS_RESET",
    verification = "VERIFICATION",
}

export enum FunctionType {
    aws = "aws",
    // TODO: not implemented
    // azure = "azure",
    // gcp = "gcp",
}
