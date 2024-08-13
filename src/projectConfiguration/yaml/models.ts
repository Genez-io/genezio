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
    mongo = "mongo",
    postgres = "postgres",
}

export enum DatabaseType {
    neon = "postgres-neon",
}

export enum TriggerType {
    jsonrpc = "jsonrpc",
    cron = "cron",
    http = "http",
}

export enum FunctionType {
    aws = "aws",
    // TODO: not implemented
    // azure = "azure",
    // gcp = "gcp",
}
