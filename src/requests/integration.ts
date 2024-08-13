import { EnableIntegrationRequest, EnableIntegrationResponse } from "../models/requests.js";
import sendRequest from "../utils/requests.js";

export async function enableEmailIntegration(
    projectId: string,
    projectEnvId: string,
): Promise<EnableIntegrationResponse> {
    return enableIntegration(
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
): Promise<EnableIntegrationResponse> {
    const { integrationName, envVars = [] } = request;

    const data: string = JSON.stringify({
        integrationName: integrationName,
        envVars: envVars,
    });

    const status = (await sendRequest(
        "POST",
        `projects/${projectId}/${projectEnvId}/integrations`,
        data,
    )) as EnableIntegrationResponse;

    return status;
}
