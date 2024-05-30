import { UserError } from "../errors.js";
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
    const projectEnv = await getProjectEnvFromProjectByName(projectName, region, stage).catch(
        (error) => {
            if (error instanceof UserError) {
                throw error;
            }
            return undefined;
        },
    );
    if (!projectEnv) {
        return undefined;
    }

    const authStatus = await getAuthStatus(projectEnv.id).catch(() => {
        return undefined;
    });

    if (!authStatus || !authStatus.enabled) {
        return undefined;
    }

    switch (authStatus.cloudProvider) {
        case CloudProviderIdentifier.GENEZIO_AWS:
            return `https://${authStatus.token}.lambda-url.${region}.on.aws/AuthService`;
        case CloudProviderIdentifier.GENEZIO_CLOUD:
            return `https://${authStatus.token}.${region}.cloud.genez.io/AuthService`;
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
        let envValue;
        try {
            envValue = await value(projectName, region, stage);
        } catch (error) {
            if (error instanceof UserError) {
                throw error;
            }
        }
        if (!envValue) {
            continue;
        }

        process.env[key] = envValue;
    }
}
