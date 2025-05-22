import axios from "./axios.js";
import { BACKEND_ENDPOINT } from "../constants.js";
import { getAuthToken } from "../utils/accounts.js";
import { debugLogger } from "../utils/logging.js";
import { DeployCodeResponse } from "../models/deployCodeResponse.js";
import { ProjectConfiguration } from "../models/projectConfiguration.js";
import { printUninformativeLog, printAdaptiveLog } from "../utils/logging.js";
import { AbortController } from "node-abort-controller";
import version from "../utils/version.js";
import { AxiosResponse } from "axios";
import { StatusOk } from "./models.js";
import { GENEZIO_NOT_AUTH_ERROR_MSG, UserError } from "../errors.js";
import { GenezioCloudInput, GenezioCloudInputType } from "../cloudAdapter/cloudAdapter.js";
import { EnvironmentVariable } from "../models/environmentVariables.js";

export async function deployRequest(
    projectConfiguration: ProjectConfiguration,
    genezioDeployInput: GenezioCloudInput[],
    stage: string,
    stack: string[] = [],
    sourceRepository?: string,
    environmentVariables?: EnvironmentVariable[],
    prepareOnly: boolean = false,
): Promise<DeployCodeResponse> {
    // auth token
    printAdaptiveLog("Checking your credentials", "start");
    const authToken = await getAuthToken();
    if (!authToken) {
        throw new UserError(GENEZIO_NOT_AUTH_ERROR_MSG);
    }
    printAdaptiveLog("Checking your credentials", "end");

    const json = JSON.stringify({
        options: projectConfiguration.options,
        classes: projectConfiguration.classes.map((genezioClass) => ({
            ...genezioClass,
            entryFile:
                genezioDeployInput.find((input) => input.name === genezioClass.name)?.entryFile ??
                "",
        })),
        functions:
            projectConfiguration.functions?.map((func) => {
                const input = genezioDeployInput.find((input) => input.name === func.name);
                return {
                    name: func.name,
                    language: func.language,
                    metadata:
                        input?.type === GenezioCloudInputType.FUNCTION
                            ? input?.metadata
                            : undefined,
                    fileName: input?.archiveName ?? "genezioDeploy.zip",
                    entryFile: input?.entryFile ?? "",
                    timeout: input?.timeout,
                    storageSize: input?.storageSize,
                    instanceSize: input?.instanceSize,
                    vcpuCount: input?.vcpuCount,
                    memoryMb: input?.memoryMb,
                    maxConcurrentRequestsPerInstance: input?.maxConcurrentRequestsPerInstance,
                    maxConcurrentInstances: input?.maxConcurrentInstances,
                    cooldownTime: input?.cooldownTime,
                    persistent: input?.persistent,
                };
            }) ?? [],
        projectName: projectConfiguration.name,
        region: projectConfiguration.region,
        cloudProvider: projectConfiguration.cloudProvider,
        stage: stage,
        stack: stack,
        sourceRepository,
        environmentVariables,
    });

    debugLogger.debug("Deploy request sent with body:", json);

    const controller = new AbortController();
    const messagePromise = printUninformativeLog(controller);
    const method = prepareOnly ? "POST" : "PUT";
    const url = prepareOnly
        ? `${BACKEND_ENDPOINT}/core/deployment/prepare`
        : `${BACKEND_ENDPOINT}/core/deployment`;

    const response: AxiosResponse<StatusOk<DeployCodeResponse>> = await axios({
        method: method,
        url: url,
        data: json,
        headers: {
            Authorization: `Bearer ${authToken}`,
            "Accept-Version": `genezio-cli/${version}`,
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
    }).catch(async (error: Error) => {
        controller.abort();
        printAdaptiveLog(await messagePromise, "error");
        debugLogger.debug("Error received", error);
        throw error;
    });

    controller.abort();
    printAdaptiveLog(await messagePromise, "end");

    debugLogger.debug("Response received", JSON.stringify(response.data));

    return response.data;
}
