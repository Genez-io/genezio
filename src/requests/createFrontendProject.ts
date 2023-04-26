import axios from "./axios";

export default async function createFrontendProject(genezioDomain: string, projectId: string) {
    const response: any = await axios({
        method: "PUT",
        url: `${genezioDomain}/core/frontend-project`,
        data: {
        projectId,
        },
    });
    return response.data;
}
