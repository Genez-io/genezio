import {
    CreateDatabaseRequest,
    CreateDatabaseResponse,
    GetConnectionUrlResponse,
    GetDatabaseConnectionUrl,
    GetDatabaseResponse,
    GetDatabasesResponse,
    LinkedDatabaseResponse,
} from "../models/requests.js";
import sendRequest from "../utils/requests.js";

export async function createDatabase(
    request: CreateDatabaseRequest,
    projectId?: string,
    envId?: string,
    linkToStage: boolean = false,
): Promise<CreateDatabaseResponse> {
    const { name, type } = request;
    let { region } = request;

    if (type === "postgres-neon") {
        region = `aws-${region}`;
    }

    const data: string = JSON.stringify({
        name: name,
        region: region,
        type: type,
        clusterType: request.clusterType,
        clusterName: request.clusterName,
        clusterTier: request.clusterTier,
    });

    const databaseResponse = (await sendRequest(
        "POST",
        "databases",
        data,
    )) as CreateDatabaseResponse;

    if (linkToStage) {
        await linkDatabaseToEnvironment(projectId, envId, databaseResponse.databaseId);
    }

    return databaseResponse;
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

export async function getDatabaseByName(name: string): Promise<GetDatabaseResponse | undefined> {
    const allDatabaseResponse: GetDatabasesResponse = await sendRequest("GET", `databases`, "");

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

export async function findLinkedDatabase(
    name: string,
    projectId: string,
    envId: string,
): Promise<GetDatabaseResponse | undefined> {
    const response = (await sendRequest(
        "GET",
        `projects/${projectId}/${envId}/databases`,
        "",
    )) as GetDatabasesResponse;

    return response.databases.find((database) => database.name === name);
}

export async function listDatabases(): Promise<GetDatabaseResponse[] | undefined> {
    const response = (await sendRequest("GET", `databases`, "")) as GetDatabasesResponse;

    return response.databases;
}

export async function getConnectionUrl(databaseId: string): Promise<string | undefined> {
    const response = (await sendRequest(
        "GET",
        `databases/${databaseId}`,
        "",
    )) as GetConnectionUrlResponse;

    return response.connectionUrl;
}
