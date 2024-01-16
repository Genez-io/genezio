import axios, { AxiosResponse } from "axios";
import { BACKEND_ENDPOINT } from "../constants.js";
import version from "../utils/version.js";
import { StatusOk, Template } from "./models.js";

export async function getNewProjectTemplateList() {
    const templateListResponse: AxiosResponse<StatusOk<{ templates: Template[] }>> =
        await axios.get(`${BACKEND_ENDPOINT}/github/templates`, {
            headers: {
                "Accept-Version": `genezio-cli/${version}`,
            },
        });

    // If compatibilityMapping is an empty string, set it to null
    const templateList = templateListResponse.data.templates.map((template) => ({
        ...template,
        compatibilityMapping:
            template.compatibilityMapping === "" ? null : template.compatibilityMapping,
    }));

    return templateList;
}
