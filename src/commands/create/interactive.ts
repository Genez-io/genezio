import colors from "colors";
import inquirer from "inquirer";
import { GenezioCreateOptions } from "../../models/commandOptions.js";
import { checkProjectName } from "../create/create.js";
import { Template, backendTemplates, frontendTemplates } from "./templates.js";
import { regions } from "../../utils/configs.js";
import axios from "axios";

export async function askCreateOptions(
    options?: Partial<GenezioCreateOptions>,
): Promise<GenezioCreateOptions> {
    const createOptions = options ?? {};
    const closestRegionPromise =
        createOptions.region === undefined ? getClosestRegion() : Promise.resolve(undefined);

    if (createOptions.name === undefined) {
        const {
            projectName,
        }: {
            projectName: string;
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
        ]);

        createOptions.name = projectName;
    }

    if (createOptions.region === undefined) {
        const closestRegion = await closestRegionPromise;
        const personalizedRegions = regions
            .filter((region) => region.value === closestRegion)
            .concat(regions.filter((region) => region.value !== closestRegion));

        const { projectRegion }: { projectRegion: string } = await inquirer.prompt([
            {
                type: "list",
                name: "projectRegion",
                message: colors.magenta("Choose a region for your project:"),
                choices: personalizedRegions,
                pageSize: personalizedRegions.length,
            },
        ]);

        createOptions.region = projectRegion;
    }

    if (createOptions.type === undefined) {
        const { projectType }: { projectType: "backend" | "fullstack" } = await inquirer.prompt([
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
                ],
            },
        ]);

        createOptions.type = projectType;
    }

    switch (createOptions.type) {
        case "fullstack": {
            createOptions.multirepo ??= false;
            createOptions.backend ??= await chooseTemplate("Backend");
            createOptions.frontend ??= await chooseTemplate("Frontend");
            break;
        }
        case "backend": {
            createOptions.backend ??= await chooseTemplate("Backend");
            break;
        }
    }

    return createOptions as Required<GenezioCreateOptions>;
}

async function chooseTemplate(category: "Backend" | "Frontend"): Promise<string> {
    let templates: Record<string, Template | undefined> = {};
    switch (category) {
        case "Backend": {
            templates = backendTemplates;
            break;
        }
        case "Frontend": {
            templates = frontendTemplates;
            break;
        }
    }

    const availableTemplates = Object.entries(templates)
        .filter(([, template]) => template !== undefined)
        .map(([id, template]) => ({
            name: template!.coloring(template!.name),
            value: id,
        }));

    const { template }: { template: string } = await inquirer.prompt([
        {
            type: "list",
            name: "template",
            message: colors.magenta("Choose a") + ` ${category} ` + colors.magenta("template:"),
            choices: availableTemplates,
        },
    ]);

    return template;
}

/**
 * Retrieves the closest region by pinging each region's endpoint.
 *
 * @returns A Promise that resolves to the closest region value or undefined if no region is available.
 */
async function getClosestRegion(): Promise<string | undefined> {
    const pings = regions.map(async (region) => {
        const url = `https://lambda.${region.value}.amazonaws.com/ping`;

        const request = await axios({ method: "get", url }).catch(() => ({ status: 400 }));

        if (request.status !== 200) {
            return Promise.reject();
        }

        return region.value;
    });

    const closest = await Promise.any(pings).catch(() => undefined);

    return closest;
}
