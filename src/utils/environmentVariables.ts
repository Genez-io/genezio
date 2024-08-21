import inquirer from "inquirer";
import { fileExists } from "./file.js";
import { getEnvironmentVariables } from "../requests/getEnvironmentVariables.js";
import path from "path";

export async function detectEnvironmentVariablesFile(path: string) {
    return await fileExists(path);
}

export async function promptToConfirmSettingEnvironmentVariables(envVars: string[]) {
    const { confirmSetEnvVars }: { confirmSetEnvVars: boolean } = await inquirer.prompt([
        {
            type: "confirm",
            name: "confirmSetEnvVars",
            message: `We detected that ${envVars.join(", ")} are not set remotely. Do you want us to set them for you?`,
            default: false,
        },
    ]);

    if (!confirmSetEnvVars) {
        return false;
    }

    return true;
}

export async function getUnsetEnvironmentVariables(
    local: string[],
    projectId: string,
    projectEnvId: string,
) {
    const remoteEnvVars = await getEnvironmentVariables(projectId, projectEnvId);

    const missingEnvVars = local.filter(
        (envVar) => !remoteEnvVars.find((remoteEnvVar) => remoteEnvVar.name === envVar),
    );

    return missingEnvVars;
}

export async function findAnEnvFile(cwd: string): Promise<string | undefined> {
    const possibleEnvFilePath = ["server/.env", ".env"];

    for (const envFilePath of possibleEnvFilePath) {
        const fullPath = path.join(cwd, envFilePath);
        if (await fileExists(fullPath)) {
            return fullPath;
        }
    }

    return undefined;
}
