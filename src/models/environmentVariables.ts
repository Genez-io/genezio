export type EnvironmentVariableRequest = {
    name: string;
    value: string;
};

export type EnvironmentVariable = {
    name: string;
    value: string;
    lastAccessedAt?: string;
    type?: string;
};
