import path from "path";
import axios from "axios";
import { BACKEND_ENDPOINT } from "../variables";
import { ClassConfiguration } from "../models/projectConfiguration";
import { getAuthToken } from "../utils/accounts";

export async function deployClass(
  classConfiguration: ClassConfiguration,
  archivePath: string,
  projectName: string,
  className: string,
  region: string
) {
  if (!archivePath || !projectName || !className) {
    throw new Error("Missing required parameters");
  }

  // auth token
  const authToken = await getAuthToken();
  if (!authToken) {
    throw new Error(
      "You are not logged in. Run 'genezio login' before you deploy your function."
      );
    }

  const json = JSON.stringify({
    configurationClassContent: JSON.stringify(classConfiguration),
    archiveName : "genezioDeploy.zip",
    filename : path.parse(classConfiguration.path).name,
    projectName : projectName,
    className : className,
    region: region,
  })

  const response: any = await axios({
    method: "PUT",
    url: `${BACKEND_ENDPOINT}/core/deployment`,
    data: json,
    headers: { Authorization: `Bearer ${authToken}` },
    maxContentLength: Infinity,
    maxBodyLength: Infinity
  }).catch((error: Error) => {
    throw error;
  });

  if (response.data.status === "error") {
    throw new Error(response.data.message);
  }

  if (response.data?.error?.message) {
    throw new Error(response.data.error.message);
  }

  return response.data;
}
