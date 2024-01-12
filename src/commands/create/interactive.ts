import colors from "colors";
import inquirer from "inquirer";
import { getNewProjectTemplateList } from "../../requests/getTemplateList.js";
import { regions } from "../../utils/configs.js";
import { Template } from "../../requests/models.js";
import { GenezioCreateOptions } from "../../models/commandOptions.js";
import { checkProjectName } from "../create/create.js";

export async function askCreateOptions(): Promise<GenezioCreateOptions> {
    const {
        projectName,
        projectRegion,
        projectType,
    }: {
        projectName: string;
        projectRegion: string;
        projectType: "backend" | "fullstack" | "frontend";
    } = await inquirer.prompt([
        {
            type: "input",
            name: "projectName",
            message: colors.magenta("Please enter a project name:"),
            default: "genezio-project",
            validate: (input: string) => {
                try {
                    checkProjectName(input);
                    return true;
                } catch (error) {
                    if (error instanceof Error) return colors.red(error.message);

                    return colors.red("Unavailable project name");
                }
            },
        },
        {
            type: "list",
            name: "projectRegion",
            message: colors.magenta("Choose a region for your project"),
            choices: regions,
            pageSize: regions.length,
        },
        {
            type: "list",
            name: "projectType",
            message: colors.magenta("What type of project would you like to create?"),
            choices: [
                {
                    name: "Backend + Frontend (Fullstack)",
                    value: "fullstack",
                },
                {
                    name: "Backend",
                    value: "backend",
                },
                // TODO: Enable after adding a static frontend template
                // {
                //     name: "Frontend",
                //     value: "frontend",
                // },
            ],
        },
    ]);

    const templateList = await getNewProjectTemplateList();

    switch (projectType) {
        case "fullstack": {
            const { projectStructure }: { projectStructure: "monorepo" | "multirepo" } =
                await inquirer.prompt([
                    {
                        type: "list",
                        name: "projectStructure",
                        message: colors.magenta("What project structure would you like to use?"),
                        choices: [
                            {
                                name: "Monorepo (Frontend and backend in the same git repository - choose this if unsure)",
                                value: "monorepo",
                            },
                            {
                                name: "Multirepo (Frontend and backend in separate git repositories)",
                                value: "multirepo",
                            },
                        ],
                    },
                ]);

            const [{ id: backendTemplateId }, { id: frontendTemplateId }] =
                await chooseFullstackTemplates(templateList);

            return {
                name: projectName,
                region: projectRegion as (typeof regions)[number]["value"],
                fullstack: [backendTemplateId, frontendTemplateId],
                structure: projectStructure,
            };
        }
        case "backend": {
            const { id: templateId } = await chooseTemplate(templateList, "Backend");

            return {
                name: projectName,
                region: projectRegion as (typeof regions)[number]["value"],
                backend: templateId,
            };
        }
        case "frontend": {
            const { id: templateId } = await chooseTemplate(templateList, "Frontend");

            return {
                name: projectName,
                region: projectRegion as (typeof regions)[number]["value"],
                frontend: templateId,
            };
        }
    }
}

async function chooseFullstackTemplates(templateList: Template[]): Promise<[Template, Template]> {
    const backendTemplate = await chooseTemplate(templateList, "Backend");

    // Create frontend, but provide only backend-compatible templates
    const frontendTemplate = await chooseTemplate(
        templateList.filter(
            (template) => template.compatibilityMapping === backendTemplate.compatibilityMapping,
        ),
        "Frontend",
    );
    return [backendTemplate, frontendTemplate];
}

async function chooseTemplate(
    templateList: Template[],
    category: "Backend" | "Frontend",
): Promise<Template> {
    const supportedLanguages = [
        // Keep only distinct languages
        ...new Set(
            templateList
                .filter((template) => template.category === category)
                .map((template) => template.language),
        ),
    ];

    if (supportedLanguages.length === 0) {
        throw new Error(
            `Unfortunately, no ${category} templates could be found for this project type :(. We are working on adding more templates!`,
        );
    }

    const { selectedLanguage }: { selectedLanguage: string } = await inquirer.prompt([
        {
            type: "list",
            name: "selectedLanguage",
            message:
                colors.magenta("Select your desired ") +
                colors.green(category) +
                colors.magenta(" language:"),
            choices: supportedLanguages.map((language) => ({
                name: colorLanguage(language),
                value: language,
            })),
        },
    ]);

    const templatesForLanguage = templateList.filter(
        (template) => template.category === category && template.language === selectedLanguage,
    );

    const { selectedTemplate }: { selectedTemplate: Template } = await inquirer.prompt([
        {
            type: "list",
            name: "selectedTemplate",
            message:
                colors.magenta("Select your desired ") +
                colorLanguage(selectedLanguage) +
                colors.magenta(" template:"),
            choices: templatesForLanguage.map((template) => ({
                name: template.name,
                value: template,
            })),
        },
    ]);

    return selectedTemplate;
}

function colorLanguage(languageName: string): string {
    switch (languageName) {
        case "TypeScript":
            return colors.blue(languageName);
        case "JavaScript":
            return colors.yellow(languageName);
        case "Python":
            return colors.green(languageName);
        case "Go":
            return colors.cyan(languageName);
        case "Dart":
            return colors.cyan(languageName);
        case "Kotlin":
            return colors.magenta(languageName);
        default:
            return languageName;
    }
}
