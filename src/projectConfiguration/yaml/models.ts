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
    mongo = "mongo-atlas",
}

export enum TriggerType {
    jsonrpc = "jsonrpc",
    cron = "cron",
    http = "http",
}

export enum AuthenticationEmailTemplateType {
    verification = "VERIFICATION",
    passwordReset = "PASS_RESET",
}

export enum FunctionType {
    aws = "aws",
    // TODO: not implemented
    // azure = "azure",
    // gcp = "gcp",
}

export const entryFileFunctionMap = {
    js: "index.mjs",
    ts: "index.mjs",
    swift: "main.swift",
    python: "main.py",
    dart: "main.dart",
    kt: "main.kt",
    go: "main.go",
};
