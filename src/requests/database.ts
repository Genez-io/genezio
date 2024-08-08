import sendRequest from "./utils.js"

export type CreateDatabaseRequest = {
    name: string;
    region: string;
    type?: string;
}

export type CreateDatabaseResponse = {
    status: string;
    databaseId: string;
}

export type LinkedDatabaseResponse = {
    status: string;
}

export async function createDatabase(request: CreateDatabaseRequest, projectId?: string, envId?: string, linkToStage: boolean = false): Promise<CreateDatabaseResponse> {
    const { name, region, type = "postgres-neon" } = request;

    const data: string = JSON.stringify({
        name: name,
        region: region,
        type: type
    });

    const databaseResponse = await sendRequest("POST", "database", data) as CreateDatabaseResponse;

    if (linkToStage) {
        await linkDatabaseToEnvironment(projectId, envId, databaseResponse.databaseId);
    }

    return databaseResponse
}

export async function linkDatabaseToEnvironment(projectId: string | undefined, envId: string | undefined, databaseId: string) {
    if (!projectId || !envId) {
        throw new Error("projectId and envId are required to link a database to an environment");
    }
    return await sendRequest("POST", `/projects/${projectId}/${envId}/databases/${databaseId}`, "") as LinkedDatabaseResponse;
}
