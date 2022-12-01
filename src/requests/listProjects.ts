import axios from "axios";
import { getAuthToken } from "../utils/accounts";
import { BACKEND_ENDPOINT } from "../variables";

export default async function listProjects(
  index = 0,
) : Promise<Array<string>> {
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
    headers: { Authorization: `Bearer ${authToken}` }
  }).catch((error: Error) => {
    throw error;
  });

  if (response.data?.error?.message) {
    throw new Error(response.data.error.message);
  }

  if (response.data.status !== 'ok') {
    console.log(response);
    throw new Error('Unknown error in `list projects` response from server.');
  }

  const projects = response.data.projects.map(function(project : any, index : any) {
    return `[${1 + index}]: Project name: ${project.name}, ID: ${project.id}`;
  })

  return projects;
}
