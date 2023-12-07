import axios from "./axios.js";
import { BACKEND_ENDPOINT } from "../constants.js";
import { getAuthToken } from "../utils/accounts.js";
import { debugLogger } from "../utils/logging.js";
import { DeployCodeResponse } from "../models/deployCodeResponse.js";
import { ProjectConfiguration } from "../models/projectConfiguration.js";
import { printUninformativeLog, printAdaptiveLog } from "../utils/logging.js";
import { AbortController } from "node-abort-controller";
import { GENEZIO_NOT_AUTH_ERROR_MSG } from "../errors.js";
import version from "../utils/version.js";
import { AxiosResponse } from "axios";
import { Status } from "./models.js";

export async function deployRequest(
    projectConfiguration: ProjectConfiguration,
    stage: string,
): Promise<DeployCodeResponse> {
    // auth token
    printAdaptiveLog("Checking your credentials", "start");
    const authToken = await getAuthToken();
    if (!authToken) {
        printAdaptiveLog("Checking your credentials", "error");
        throw new Error(
            "You are not logged in. Run 'genezio login' before you deploy your function.",
        );
    }
    printAdaptiveLog("Checking your credentials", "end");

    const json = JSON.stringify({
        options: projectConfiguration.options,
        classes: projectConfiguration.classes,
        projectName: projectConfiguration.name,
        region: projectConfiguration.region,
        cloudProvider: projectConfiguration.cloudProvider,
        stage: stage,
    });

    const controller = new AbortController();
    const messagePromise = printUninformativeLog(controller);
    const response: AxiosResponse<Status<DeployCodeResponse>> = await axios({
        method: "PUT",
        url: `${BACKEND_ENDPOINT}/core/deployment`,
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

    debugLogger.debug("Response received", response.data);

    if (response.data.status === "error") {
        if (response.data.error.message === "Unauthorized") {
            throw new Error(GENEZIO_NOT_AUTH_ERROR_MSG);
        }

        throw new Error(response.data.error.message);
    }

    return response.data;
}
