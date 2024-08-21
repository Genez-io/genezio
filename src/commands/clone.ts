import { isLoggedIn } from "../utils/accounts.js";
import { downloadProject } from "../utils/downloadProject.js";
import { createTemporaryFolder } from "../utils/file.js";
import { debugLogger } from "../utils/logging.js";
import { loginCommand } from "./login.js";
import path from "path";
import admZip from "adm-zip";
import { getPresignedURLForProjectCodePull } from "../requests/getPresignedURLForProjectCodePull.js";
import { GenezioCloneOptions } from "../models/commandOptions.js";
import { regions } from "../utils/configs.js";
import inquirer from "inquirer";
import { checkProjectName } from "./create/create.js";
import colors from "colors";
import { getClosestRegion } from "./create/interactive.js";
import getProjectInfoByName from "../requests/getProjectInfoByName.js";
import { UserError } from "../errors.js";

export async function askCloneOptions(
    options?: Partial<GenezioCloneOptions>,
): Promise<GenezioCloneOptions> {
    const cloneOptions = options ?? {};
    const closestRegionPromise =
        cloneOptions.region === undefined ? getClosestRegion() : Promise.resolve(undefined);

    if (cloneOptions.name === undefined) {
        const {
            projectName,
        }: {
            projectName: string;
        } = await inquirer.prompt([
            {
                type: "input",
                name: "projectName",
                message: colors.magenta("Please enter your project name:"),
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

        cloneOptions.name = projectName;
    }

    if (cloneOptions.region === undefined) {
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

        cloneOptions.region = projectRegion;
    }

    if (cloneOptions.stage === undefined) {
        const {
            stage,
        }: {
            stage: string;
        } = await inquirer.prompt([
            {
                type: "input",
                name: "stage",
                default: "prod",
                message: colors.magenta("Please enter the name of the stage:"),
            },
        ]);

        cloneOptions.stage = stage;
    }

    const stageName = cloneOptions.stage;
    cloneOptions.stage = "";
    const projectDetails = await getProjectInfoByName(cloneOptions.name);
    for (const projectEnv of projectDetails.projectEnvs) {
        if (projectEnv.name === stageName) {
            cloneOptions.stage = projectEnv.id;
            break;
        }
    }

    if (cloneOptions.stage === "") {
        throw new UserError(
            `Stage ${stageName} not found in project ${cloneOptions.name}. Please run 'genezio deploy --stage ${stageName}' to deploy your project to a new stage.`,
        );
    }

    debugLogger.debug(
        `Cloning project ${cloneOptions.name} in region ${cloneOptions.region} and stage ${cloneOptions.stage}`,
    );

    return cloneOptions as Required<GenezioCloneOptions>;
}

export async function cloneCommand(
    projectName: string,
    region: string,
    stage: string,
    projectPath: string,
) {
    // check if user is logged in
    if (!(await isLoggedIn())) {
        debugLogger.debug("No auth token found. Starting automatic authentication...");
        await loginCommand("", false);
    }

    // get the project presigned url
    const url = await getPresignedURLForProjectCodePull(region, projectName, stage);

    if (url === undefined) {
        debugLogger.debug("Failed to get presigned URL for project code push.");
        throw new Error("Failed to get URL for project code. Please open an issue on GitHub");
    }

    // download the project
    const tmpFolder = await createTemporaryFolder();

    // download the archive to the temporary folder
    debugLogger.debug(`Downloading project from ${url} to ${tmpFolder}`);
    await downloadProject(url, path.join(tmpFolder, "projectCode.zip")).catch((error) => {
        debugLogger.debug(`Failed to download project: ${error}`);
        throw new Error(
            "Failed to download project. Make sure the project exists and you have access to it.",
        );
    });

    // extract the project to the specified path
    debugLogger.debug(`Extracting project to ${projectPath}`);
    const zip = new admZip(path.join(tmpFolder, "projectCode.zip"));
    try {
        zip.extractAllTo(projectPath, true);
    } catch (error) {
        debugLogger.debug(`Failed to extract files: ${error}`);
        throw new Error("Failed to extract files. Please open an issue on GitHub");
    }
}
