import { CloudProviderIdentifier } from "../models/cloudProviderIdentifier.js";
import getAuthStatus from "../requests/getAuthStatus.js";
import { getProjectEnvFromProjectByName } from "../requests/getProjectInfoByName.js";
import { debugLogger } from "./logging.js";

export const servicesEnvVariables = {
    GNZ_AUTH_FUNCTION_URL: getAuthFunctionUrl,
};

async function getAuthFunctionUrl(
    projectName: string,
    region: string,
    stage: string,
): Promise<string | undefined> {
    console.log("stage", stage);
    const projectEnv = await getProjectEnvFromProjectByName(projectName, region, stage).catch(
        (e: any) => {
            console.log(`error`, e);
            return undefined;
        },
    );
    if (!projectEnv) {
        return undefined;
    }
    console.log(`the project env is`, JSON.stringify(projectEnv));

    const authStatus = await getAuthStatus(projectEnv.id).catch(() => {
        return undefined;
    });

    if (!authStatus || !authStatus.enabled) {
        return undefined;
    }

    switch (authStatus.cloudProvider) {
        case CloudProviderIdentifier.GENEZIO:
            return `https://${authStatus.token}.lambda-url.${region}.on.aws/AuthService`;
        default:
            debugLogger.error(`Cloud provider ${authStatus.cloudProvider} is not supported yet`);
            return undefined;
    }
}

export async function importServiceEnvVariables(
    projectName: string,
    region: string,
    stage: string,
) {
    for (const [key, value] of Object.entries(servicesEnvVariables)) {
        const envValue = await value(projectName, region, stage);
        console.log(`envValue`, envValue);
        if (!envValue) {
            continue;
        }

        process.env[key] = envValue;
    }
}
