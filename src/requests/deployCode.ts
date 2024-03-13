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
import { UserError } from "../errors.js";

export async function deployRequest(
    projectConfiguration: ProjectConfiguration,
    stage: string,
): Promise<DeployCodeResponse> {
    // auth token
    printAdaptiveLog("Checking your credentials", "start");
    const authToken = await getAuthToken();
    if (!authToken) {
        printAdaptiveLog("Checking your credentials", "error");
        throw new UserError(
            "You are not logged in. Run 'genezio login' before you deploy your function.",
        );
    }
    printAdaptiveLog("Checking your credentials", "end");

    // TODO: Remove this trick when the backend is ready to receive the language without the dot
    for (const classConfiguration of projectConfiguration.classes) {
        classConfiguration.language = "." + classConfiguration.language;
    }

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
    const response: AxiosResponse<StatusOk<DeployCodeResponse>> = await axios({
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

    return response.data;
}
