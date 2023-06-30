import axios from "./axios.js";
import { getAuthToken } from "../utils/accounts.js";
import { BACKEND_ENDPOINT } from "../constants.js";
import version from "../utils/version.js";

export default async function listProjects(
  index = 0,
) : Promise<Array<any>> {
  const limit = 100;

  const authToken = await getAuthToken()

  if (!authToken) {
    throw new Error(
      "You are not logged in. Run 'genezio login' before you delete your function."
    );
  }

  const response: any = await axios({
    method: "GET",
    url: `${BACKEND_ENDPOINT}/projects?startIndex=${index}&projectsLimit=${limit}`,
    timeout: 15000,
    headers: {
      Authorization: `Bearer ${authToken}`,
      "Accept-Version": `genezio-cli/${version}`
    }
  }).catch((error: Error) => {
    throw error;
  });

  if (response.data?.error?.message) {
    throw new Error(response.data.error.message);
  }

  if (response.data.status !== 'ok') {
    throw new Error('Unknown error in `list projects` response from server.');
  }

  const projects = response.data.projects;

  return projects;
}
