import { CloudProviderIdentifier } from "../models/cloudProviderIdentifier.js";
import {
    CreateEmptyProjectRequest,
    CreateEmptyProjectResponse,
    GetProjectDetailsResponse,
} from "../models/requests.js";
import sendRequest from "../utils/requests.js";

export async function createEmptyProject(
    request: CreateEmptyProjectRequest,
): Promise<CreateEmptyProjectResponse> {
    const {
        projectName,
        region,
        cloudProvider = CloudProviderIdentifier.GENEZIO_CLOUD,
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
