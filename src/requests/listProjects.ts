import FormData from "form-data";
import axios from "axios";
import { readToken } from "../utils/file";
import { BACKEND_ENDPOINT } from "../variables";

export default async function listProjects(
  index = 0,
) : Promise<Array<Array<string>>> {
  const limit = 100;

  const form = new FormData();

  const authToken = await readToken().catch(() => undefined);

  if (!authToken) {
    throw new Error(
      "You are not logged in. Run 'genezio login' before you delete your function."
    );
  }

  const response: any = await axios({
    method: "GET",
    url: `${BACKEND_ENDPOINT}/projects?startIndex=${index}&projectsLimit=${limit}`,
    data: form,
    timeout: 100000,
    headers: { ...form.getHeaders(), Authorization: `Bearer ${authToken}` }
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
    return [`[${index}]`, `Project name: ${project.name}`, `ID: ${project.id}`];
  })

  if (projects.length === 0) {
    console.log("There are no currently deployed projects.");
  } else {
    console.log(projects);
  }

  return projects;
}
