import axios, { AxiosResponse } from "axios";
import { BACKEND_ENDPOINT } from "../constants.js";
import version from "../utils/version.js";
import { Status, Template } from "./models.js";

export async function getNewProjectTemplateList() {
    const templateListResponse: AxiosResponse<Status<{ templates: Template[] }>> = await axios.get(
        `${BACKEND_ENDPOINT}/github/templates`,
        {
            headers: {
                "Accept-Version": `genezio-cli/${version}`,
            },
        },
    );

    if (templateListResponse.data.status === "error") {
        throw new Error(templateListResponse.data.error.message);
    }

    // If compatibilityMapping is an empty string, set it to null
    const templateList = templateListResponse.data.templates.map((template) => ({
        ...template,
        compatibilityMapping:
            template.compatibilityMapping === "" ? null : template.compatibilityMapping,
    }));

    return templateList;
}
