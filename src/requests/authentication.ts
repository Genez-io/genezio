import sendRequest from "../utils/requests.js";

export interface GoogleProvider {
    id: string;
    secret: string;
}

export interface AuthenticationProviders {
    email?: boolean;
    web3?: boolean;
    google?: GoogleProvider;
}

export interface SetAuthenticationRequest {
    enabled: boolean;
    databaseType: string;
    databaseUrl: string;
}

export interface SetAuthenticationResponse {
    enabled: boolean;
    databaseType: string;
    databaseUrl: string;
    region: string;
    token: string;
}

export interface AuthProviderDetails {
    id: string;
    name: string;
    enabled: boolean;
    config: { [key: string]: string };
}

export interface GetAuthProvidersResponse {
    status: string;
    authProviders: AuthProviderDetails[];
}

export interface SetAuthProvidersRequest {
    authProviders: AuthProviderDetails[];
}

export interface SetAuthProvidersResponse {
    status: string;
    authProviders: AuthProviderDetails[];
}

export interface GetAuthenticationResponse {
    enabled: boolean;
    databaseUrl: string;
    databaseType: string;
    token: string;
    region: string;
}

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
