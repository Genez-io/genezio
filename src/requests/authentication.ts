// import sendRequest from "./utils.js"

// export type EnableAuthenticationForEnvironmentRequest = {
//     enabled: boolean;
//     databaseUrl: string;
//     databaseType: string;
// }


// export async function enableAuthenticationForEnvironment(request: EnableAuthenticationForEnvironmentRequest): Promise<> {
//     const { enabled, databaseUrl, databaseType } = request;

//     const data: string = JSON.stringify({
//         enabled: enabled,
//         databaseUrl: databaseUrl,
//         databaseType: databaseType
//     });

//     const emptyProjectResponse = await sendRequest("PUT", "core/auth/${envId}", data) as CreateEmptyProjectResponse;

//     return emptyProjectResponse
// }
