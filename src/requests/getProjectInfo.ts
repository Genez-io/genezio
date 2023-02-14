import axios from "./axios";
import { getAuthToken } from "../utils/accounts";
import { BACKEND_ENDPOINT } from "../variables";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pjson = require("../../package.json");

export default async function getProjectInfo(
  projectId: string,
) : Promise<any> {
  const authToken = await getAuthToken()

  if (!authToken) {
    throw new Error(
      "You are not logged in. Run 'genezio login' before you deploy your function."
    );
  }

  const response: any = await axios({
    method: "GET",
    url: `${BACKEND_ENDPOINT}/projects/${projectId}`,
    headers: {
      Authorization: `Bearer ${authToken}`,
      "Accept-Version": `genezio-cli/${pjson.version}`
    }
  }).catch((error: Error) => {
    throw error;
  });

  if (response.data?.error?.message) {
    throw new Error(response.data.error.message);
  }

  if (response.data.status !== 'ok') {
    console.log('Unknown error in getting the project info from the server.');
    return null;
  }

  return response.data.project;
}
