import axios from "./axios.js";
import { getAuthToken } from "../utils/accounts.js";
import { BACKEND_ENDPOINT } from "../constants.js";
import version from "../utils/version.js";
import { GENEZIO_NOT_AUTH_ERROR_MSG, UserError } from "../errors.js";
import { ProjectListElement, StatusOk } from "./models.js";
import { AxiosResponse } from "axios";

export default async function listProjects(index = 0, limit = 100): Promise<ProjectListElement[]> {
    const authToken = await getAuthToken();

    if (!authToken) {
        throw new UserError(GENEZIO_NOT_AUTH_ERROR_MSG);
    }

    const response: AxiosResponse<StatusOk<{ projects: ProjectListElement[] }>> = await axios({
        method: "GET",
        url: `${BACKEND_ENDPOINT}/projects?startIndex=${index}&projectsLimit=${limit}`,
        timeout: 15000,
        headers: {
            Authorization: `Bearer ${authToken}`,
            "Accept-Version": `genezio-cli/${version}`,
        },
    });

    return response.data.projects;
}
