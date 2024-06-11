import axios from "./axios.js";
import { getAuthToken } from "../utils/accounts.js";
import { GENEZIO_NOT_AUTH_ERROR_MSG, UserError } from "../errors.js";
import { BACKEND_ENDPOINT } from "../constants.js";
import version from "../utils/version.js";
import { AxiosResponse } from "axios";
import { StatusOk } from "./models.js";
import { debugLogger } from "../utils/logging.js";

export async function createFrontendProject(
    genezioDomain: string,
    projectName: string,
    region: string,
    stage: string,
) {
    // Check if user is authenticated
    const authToken = await getAuthToken();
    if (!authToken) {
        throw new UserError(GENEZIO_NOT_AUTH_ERROR_MSG);
    }

    const json = JSON.stringify({
        genezioDomain,
        projectName,
        region,
        stage,
    });

    await axios({
        method: "PUT",
        url: `${BACKEND_ENDPOINT}/frontend`,
        data: json,
        headers: {
            Authorization: `Bearer ${authToken}`,
            "Accept-Version": `genezio-cli/${version}`,
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
    });
}

export interface CreateFrontendV2Request {
    projectName: string;
    region: string;
    stage: string;
    domainName: string;
    paths: CreateFrontendV2Path[];
    defaultPath: Omit<CreateFrontendV2Path, "pattern">;
}

export interface CreateFrontendV2Path {
    pattern: string;
    origin: CreateFrontendV2Origin;
}

export interface CreateFrontendV2Origin {
    domain: {
        id: "frontendHosting" | string /* Function URL */;
        type: "s3" | "function";
    };
    path: string | undefined;
    methods: string[];
    cachePolicy: "no-cache" | "custom-function-cache" | "caching-optimized";
}

export async function createFrontendProjectV2(
    domainName: string,
    projectName: string,
    region: string,
    stage: string,
    paths: CreateFrontendV2Path[],
    defaultPath: Omit<CreateFrontendV2Path, "pattern">,
) {
    // Check if user is authenticated
    const authToken = await getAuthToken();
    if (!authToken) {
        throw new UserError(GENEZIO_NOT_AUTH_ERROR_MSG);
    }

    const body: CreateFrontendV2Request = {
        domainName,
        projectName,
        region,
        stage,
        paths,
        defaultPath,
    };

    debugLogger.debug(`Sending create frontend request: ${JSON.stringify(body)}`);

    const response: AxiosResponse<StatusOk<{ domain: string }>> = await axios({
        method: "PUT",
        url: `${BACKEND_ENDPOINT}/v2/frontend`,
        data: JSON.stringify(body),
        headers: {
            Authorization: `Bearer ${authToken}`,
            "Accept-Version": `genezio-cli/${version}`,
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
    });

    return response.data;
}
