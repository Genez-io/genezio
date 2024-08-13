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
