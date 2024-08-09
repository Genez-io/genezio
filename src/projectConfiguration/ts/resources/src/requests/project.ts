import sendRequest from "./utils.js";

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

export interface ProjectDetailsEnvElement {
    id: string;
    name: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    classes: any[];
    functions?: FunctionDetails[];
}

export interface FunctionDetails {
    id: string;
    name: string;
    projectName: string;
    status: string;
    cloudUrl: string;
    createdAt: number;
    updatedAt: number;
}

export async function createEmptyProject(
    request: CreateEmptyProjectRequest,
): Promise<CreateEmptyProjectResponse> {
    const {
        projectName,
        region,
        cloudProvider = "genezio-cloud",
        stage = "prod",
        stack = [],
    } = request;

    const data: string = JSON.stringify({
        projectName: projectName,
        region: region,
        cloudProvider: cloudProvider,
        stage: stage,
        stack: stack,
    });

    const emptyProjectResponse = (await sendRequest(
        "PUT",
        "core/deployment",
        data,
    )) as CreateEmptyProjectResponse;

    return emptyProjectResponse;
}

export async function getProjectDetailsById(id: string): Promise<GetProjectDetailsResponse> {
    const getProjectDetailsResponse = (await sendRequest(
        "GET",
        `projects/${id}`,
        "",
    )) as GetProjectDetailsResponse;

    return getProjectDetailsResponse;
}

export async function getProjectDetailsByName(name: string): Promise<GetProjectDetailsResponse> {
    const getProjectDetailsResponse = (await sendRequest(
        "GET",
        `projects/name/${name}`,
        "",
    )) as GetProjectDetailsResponse;

    return getProjectDetailsResponse;
}
