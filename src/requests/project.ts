import sendRequest from "./utils.js"

export type CreateEmptyProjectRequest = {
    projectName: string;
    region: string;
    cloudProvider: string;
    stage: string;
    stack?: string[];
}

export type CreateEmptyProjectResponse = {
    status: string;
    projectId: string;
    projectEnvId: string;
    createdAt: number;
    updatedAt: number;
}

export async function createEmptyProject(request: CreateEmptyProjectRequest): Promise<CreateEmptyProjectResponse> {
    const { projectName, region, cloudProvider = "genezio-cloud", stage = "prod", stack = [] } = request;

    const data: string = JSON.stringify({
        projectName: projectName,
        region: region,
        cloudProvider: cloudProvider,
        stage: stage,
        stack: stack
    });

    const emptyProjectResponse = await sendRequest("PUT", "core/deployment", data) as CreateEmptyProjectResponse;

    return emptyProjectResponse
}
