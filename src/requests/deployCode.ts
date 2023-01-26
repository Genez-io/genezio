import axios from "axios";
import { BACKEND_ENDPOINT } from "../variables";
import { getAuthToken } from "../utils/accounts";
import { debugLogger } from "../utils/logging";
import { DeployCodeResponse } from "../models/deployCodeResponse";
import { ProjectConfiguration } from "../models/projectConfiguration";

export async function deployRequest(
  projectConfiguration: ProjectConfiguration,
): Promise<DeployCodeResponse> {
  // auth token
  const authToken = await getAuthToken();
  if (!authToken) {
    throw new Error(
      "You are not logged in. Run 'genezio login' before you deploy your function."
      );
    }

  const json = JSON.stringify({
    classes: projectConfiguration.classes,
    projectName : projectConfiguration.name,
    region: projectConfiguration.region,
  })

  const response: any = await axios({
    method: "PUT",
    url: `${BACKEND_ENDPOINT}/core/deployment`,
    data: json,
    headers: { Authorization: `Bearer ${authToken}` },
    maxContentLength: Infinity,
    maxBodyLength: Infinity
  }).catch((error: Error) => {
    debugLogger.debug("Error received", error)
    throw error;
  });

  debugLogger.debug("Response received", response.data)

  if (response.data.status === "error") {
    throw new Error(response.data.message);
  }

  if (response.data?.error?.message) {
    throw new Error(response.data.error.message);
  }

  return response.data;
}
