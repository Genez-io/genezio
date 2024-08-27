import {
    AuthenticationDatabaseType,
    AuthenticationEmailTemplateType,
} from "../projectConfiguration/yaml/models.js";
import { ProjectDetailsEnvElement } from "../requests/models.js";

export interface CreateDatabaseRequest {
    name: string;
    region: string;
    type?: string;
}

export interface CreateDatabaseResponse {
    status: string;
    databaseId: string;
}

export interface GetDatabaseConnectionUrl {
    status: string;
    connectionUrl: string;
}

export interface GetDatabaseResponse {
    id: string;
    name: string;
    region: string;
    connectionUrl?: string;
    type: string;
}

export interface GetDatabasesResponse {
    status: string;
    databases: {
        id: string;
        name: string;
        region: string;
        connectionUrl?: string;
        type: string;
    }[];
}

export interface LinkedDatabaseResponse {
    status: string;
}

export interface CreateEmptyProjectRequest {
    projectName: string;
    region: string;
    cloudProvider: string;
    stage: string;
    stack?: string[];
}

export interface CreateEmptyProjectResponse {
    status: string;
    projectId: string;
    projectEnvId: string;
    createdAt: number;
    updatedAt: number;
}

export interface GetProjectDetailsResponse {
    id: string;
    name: string;
    region: string;
    createdAt: number;
    updatedAt: number;
    projectEnvs: ProjectDetailsEnvElement[];
}

export type YourOwnAuthDatabaseConfig = {
    uri: string;
    type: AuthenticationDatabaseType;
};

export type NativeAuthDatabaseConfig = {
    name: string;
};

export type AuthDatabaseConfig = YourOwnAuthDatabaseConfig | NativeAuthDatabaseConfig;

export interface EnableIntegrationRequest {
    integrationName: string;
    envVars?: string[];
}

export interface IntegrationResponse {
    status: string;
}

export interface GetIntegrationResponse {
    status: string;
    integrations: string[];
}

export interface GoogleProvider {
    clientId: string;
    clientSecret: string;
}

export interface AuthenticationProviders {
    email?: boolean;
    web3?: boolean;
    google?: GoogleProvider;
}

export interface SetAuthenticationRequest {
    enabled: boolean;
    databaseType: AuthenticationDatabaseType;
    databaseUrl: string;
}

export interface SetAuthenticationResponse {
    enabled: boolean;
    databaseType: string;
    databaseUrl: string;
    region: string;
    token: string;
}

export interface AuthProviderDetails {
    id: string;
    name: string;
    enabled: boolean;
    config: { [key: string]: string } | null;
}

export interface GetAuthProvidersResponse {
    status: string;
    authProviders: AuthProviderDetails[];
}

export interface SetAuthProvidersRequest {
    authProviders: AuthProviderDetails[];
}

export interface SetAuthProvidersResponse {
    status: string;
    authProviders: AuthProviderDetails[];
}

export interface GetAuthenticationResponse {
    enabled: boolean;
    databaseUrl: string;
    databaseType: string;
    token: string;
    region: string;
}

export interface AuthenticationSettings {
    passwordReset?: {
        redirectUrl: string;
    };
    emailVerification?: {
        redirectUrl: string;
    };
}

export type SetEmailTemplatesRequest = {
    templates: {
        type: AuthenticationEmailTemplateType;
        template: {
            senderName: string;
            senderEmail: string;
            subject: string;
            message: string;
            redirectUrl?: string;
        };
        variables?: string[];
    }[];
};

export type setEmailTemplatesResponse = {
    templates: {
        type: string;
        template: {
            senderName: string;
            senderEmail: string;
            subject: string;
            message: string;
            redirectUrl: string;
        };
        variables: string[];
    };
};
