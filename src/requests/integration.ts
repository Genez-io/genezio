import {
    EnableIntegrationRequest,
    GetIntegrationResponse,
    IntegrationResponse,
} from "../models/requests.js";
import sendRequest from "../utils/requests.js";

export async function enableEmailIntegration(
    projectId: string,
    projectEnvId: string,
): Promise<IntegrationResponse> {
    return enableIntegration(
        {
            integrationName: "EMAIL-SERVICE",
        },
        projectId,
        projectEnvId,
    );
}

export async function disableEmailIntegration(
    projectId: string,
    projectEnvId: string,
): Promise<IntegrationResponse> {
    return disableIntegration(
        {
            integrationName: "EMAIL-SERVICE",
        },
        projectId,
        projectEnvId,
    );
}

export async function enableIntegration(
    request: EnableIntegrationRequest,
    projectId: string,
    projectEnvId: string,
): Promise<IntegrationResponse> {
    const { integrationName, envVars = [] } = request;

    const data: string = JSON.stringify({
        integrationName: integrationName,
        envVars: envVars,
    });

    const status = (await sendRequest(
        "POST",
        `projects/${projectId}/${projectEnvId}/integrations`,
        data,
    )) as IntegrationResponse;

    return status;
}

export async function disableIntegration(
    request: EnableIntegrationRequest,
    projectId: string,
    projectEnvId: string,
): Promise<IntegrationResponse> {
    const { integrationName, envVars = [] } = request;

    const data: string = JSON.stringify({
        integrationName: integrationName,
        envVars: envVars,
    });

    const status = (await sendRequest(
        "DELETE",
        `projects/${projectId}/${projectEnvId}/integrations`,
        data,
    )) as IntegrationResponse;

    return status;
}

export async function getProjectIntegrations(
    projectId: string,
    projectEnvId: string,
): Promise<GetIntegrationResponse> {
    const response = (await sendRequest(
        "GET",
        `projects/${projectId}/${projectEnvId}/integrations`,
        "",
    )) as GetIntegrationResponse;

    return response;
}
