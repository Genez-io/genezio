import {
    EmailTemplatesResponse,
    GetAuthenticationResponse,
    GetAuthProvidersResponse,
    SetAuthenticationRequest,
    SetAuthenticationResponse,
    SetAuthProvidersRequest,
    SetAuthProvidersResponse,
    SetEmailTemplatesRequest,
} from "../models/requests.js";
import sendRequest from "../utils/requests.js";

export async function setAuthentication(
    envId: string,
    request: SetAuthenticationRequest,
): Promise<SetAuthenticationResponse> {
    const data: string = JSON.stringify(request);

    const response = (await sendRequest(
        "PUT",
        `core/auth/${envId}`,
        data,
    )) as SetAuthenticationResponse;

    return response;
}

export async function getAuthentication(envId: string): Promise<GetAuthenticationResponse> {
    const response = (await sendRequest(
        "GET",
        `core/auth/${envId}`,
        "",
    )) as GetAuthenticationResponse;

    return response;
}

export async function getAuthProviders(envId: string): Promise<GetAuthProvidersResponse> {
    const response = (await sendRequest(
        "GET",
        `core/auth/providers/${envId}`,
        "",
    )) as GetAuthProvidersResponse;

    return response;
}

export async function setAuthProviders(
    envId: string,
    request: SetAuthProvidersRequest,
): Promise<SetAuthProvidersResponse> {
    const data: string = JSON.stringify(request);

    const response = (await sendRequest(
        "PUT",
        `core/auth/providers/${envId}`,
        data,
    )) as SetAuthProvidersResponse;

    return response;
}

export async function getEmailTemplates(envId: string) {
    const response = (await sendRequest(
        "GET",
        `core/auth/email-templates/${envId}`,
        "",
    )) as EmailTemplatesResponse;

    return response;
}

export async function setEmailTemplates(envId: string, request: SetEmailTemplatesRequest) {
    const data: string = JSON.stringify(request);

    const response = (await sendRequest(
        "PUT",
        `core/auth/email-templates/${envId}`,
        data,
    )) as EmailTemplatesResponse;

    return response;
}
