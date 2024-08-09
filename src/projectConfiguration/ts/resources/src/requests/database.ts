import sendRequest from "./utils.js";

export interface CreateDatabaseRequest {
    name: string;
    region: string;
    type?: string;
}

export interface CreateDatabaseResponse {
    status: string;
    databaseId: string;
    connectionUrl?: string;
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

export interface GetAllDatabasesResponse {
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

export async function createDatabase(
    request: CreateDatabaseRequest,
    projectId?: string,
    envId?: string,
    linkToStage: boolean = false,
): Promise<CreateDatabaseResponse> {
    const { name, region, type = "postgres-neon" } = request;

    const data: string = JSON.stringify({
        name: name,
        region: `aws-${region}`,
        type: type,
    });

    const databaseResponse = (await sendRequest(
        "POST",
        "databases",
        data,
    )) as CreateDatabaseResponse;

    // Populate connectionUrl
    databaseResponse.connectionUrl = (
        (await sendRequest(
            "GET",
            `databases/${databaseResponse.databaseId}`,
            "",
        )) as GetDatabaseConnectionUrl
    ).connectionUrl;

    if (linkToStage) {
        await linkDatabaseToEnvironment(projectId, envId, databaseResponse.databaseId);
    }

    return databaseResponse;
}

// TODO: This can be optimized with an endpoint GET /databases/${name}
export async function getDatabaseByName(name: string): Promise<GetDatabaseResponse | undefined> {
    const allDatabaseResponse: GetAllDatabasesResponse = await sendRequest("GET", `databases`, "");

    const getDatabaseResponse = allDatabaseResponse.databases.find(
        (database) => database.name === name,
    );

    if (getDatabaseResponse) {
        getDatabaseResponse.connectionUrl = (
            (await sendRequest(
                "GET",
                `databases/${getDatabaseResponse.id}`,
                "",
            )) as GetDatabaseConnectionUrl
        ).connectionUrl;
    }

    return getDatabaseResponse;
}

export async function linkDatabaseToEnvironment(
    projectId: string | undefined,
    envId: string | undefined,
    databaseId: string,
) {
    if (!projectId || !envId) {
        throw new Error("projectId and envId are required to link a database to an environment");
    }
    return (await sendRequest(
        "POST",
        `projects/${projectId}/${envId}/databases/${databaseId}`,
        "",
    )) as LinkedDatabaseResponse;
}
