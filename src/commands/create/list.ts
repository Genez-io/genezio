import log from "loglevel";
import { getNewProjectTemplateList } from "../../requests/getTemplateList.js";
import { Template, TemplateCategory } from "../../requests/models.js";
import colors from "colors";
import { colorLanguage } from "./interactive.js";

export async function listCreateTemplates(filter: string | undefined = undefined) {
    const templates = await getNewProjectTemplateList();

    const backendTemplates = templates.filter((template) => template.category === "Backend");
    const frontendTemplates = templates.filter((template) => template.category === "Frontend");

    backendTemplates
        .filter((t) => filterTemplate(t, filter))
        .forEach((template) => listTemplate(template, frontendTemplates));
    frontendTemplates
        .filter((t) => filterTemplate(t, filter))
        .forEach((template) => listTemplate(template, backendTemplates));
}

function listTemplate(template: Template, allTemplates: Template[]) {
    const compatibleWith = allTemplates
        .filter((t) => t.compatibilityMapping === template.compatibilityMapping)
        .map((t) => t.id)
        .join(", ");

    let compatibilityText = `Compatile with (fullstack): ${colors.yellow(compatibleWith)}`;
    if (compatibleWith.length === 0) {
        compatibilityText = colors.red("Standalone template. Can't be used in fullstack projects.");
    }

    const templateText = `${colors.magenta(template.id)} - ${template.name}
    ${colors.gray(template.description)}
    ${colorCategory(template.category)}, ${colorLanguage(template.language)}
    ${compatibilityText}
`;

    log.info(templateText);
}

function filterTemplate(template: Template, filter: string | undefined): boolean {
    if (!filter) {
        return true;
    }

    const filterLower = filter.toLowerCase();

    return (
        template.id.toLowerCase().includes(filterLower) ||
        template.name.toLowerCase().includes(filterLower) ||
        template.description.toLowerCase().includes(filterLower) ||
        template.category.toLowerCase().includes(filterLower) ||
        template.language.toLowerCase().includes(filterLower) ||
        (filterLower === "fullstack" && template.compatibilityMapping !== undefined) ||
        (filterLower === "standalone" && template.compatibilityMapping === undefined)
    );
}

function colorCategory(category: TemplateCategory): string {
    switch (category) {
        case "Backend":
            return colors.cyan(category);
        case "Frontend":
            return colors.green(category);
        default:
            return category;
    }
}
