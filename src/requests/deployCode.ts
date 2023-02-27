import axios from "./axios";
import { BACKEND_ENDPOINT } from "../variables";
import { getAuthToken } from "../utils/accounts";
import { debugLogger } from "../utils/logging";
import { DeployCodeResponse } from "../models/deployCodeResponse";
import { ProjectConfiguration } from "../models/projectConfiguration";
import { printUninformativeLog, printAdaptiveLog } from "../utils/logging";
import { AbortController } from "node-abort-controller";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pjson = require("../../package.json");

export async function deployRequest(
  projectConfiguration: ProjectConfiguration,
): Promise<DeployCodeResponse> {
  // auth token
  printAdaptiveLog("Checking your credentials", "start");
  const authToken = await getAuthToken();
  if (!authToken) {
    printAdaptiveLog("Checking your credentials", "error");
    throw new Error(
      "You are not logged in. Run 'genezio login' before you deploy your function."
      );
    }
  printAdaptiveLog("Checking your credentials", "end");

  const json = JSON.stringify({
    classes: projectConfiguration.classes,
    projectName : projectConfiguration.name,
    region: projectConfiguration.region,
    cloudProvider: projectConfiguration.cloudProvider,
  })

  const controller = new AbortController();
  const messagePromise = printUninformativeLog(controller);
  const response: any = await axios({
    method: "PUT",
    url: `${BACKEND_ENDPOINT}/core/deployment`,
    data: json,
    headers: {
      Authorization: `Bearer ${authToken}`,
      "Accept-Version": `genezio-cli/${pjson.version}`
    },
    maxContentLength: Infinity,
    maxBodyLength: Infinity
  }).catch(async (error: Error) => {
    controller.abort();
    printAdaptiveLog(await messagePromise, "error");
    debugLogger.debug("Error received", error)
    throw error;
  });

  controller.abort();
  printAdaptiveLog(await messagePromise, "end");

  debugLogger.debug("Response received", response.data)

  if (response.data.status === "error") {
    throw new Error(response.data.message);
  }

  if (response.data?.error?.message) {
    throw new Error(response.data.error.message);
  }

  return response.data;
}
