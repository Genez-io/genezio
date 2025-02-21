import inquirer from "inquirer";
import path from "path";
import colors from "colors";
import { fileExists, readEnvironmentVariablesFile } from "./file.js";
import { getEnvironmentVariables } from "../requests/getEnvironmentVariables.js";
import { YamlProjectConfiguration } from "../projectConfiguration/yaml/v2.js";
import { evaluateResource } from "../commands/deploy/utils.js";
import { DASHBOARD_URL } from "../constants.js";
import { log } from "./logging.js";

export type ConfigurationVariable =
    | {
          path: string;
          field: string;
      }
    | {
          key: string;
      }
    | {
          value: string;
      };

/**
 * Parses a configuration variable string to extract the path and field.
 *
 * @param rawValue The raw string value of the configuration variable.
 * @returns An object containing the path and field, or the key, or the value.
 *
 * @example
 * parseConfigurationVariable("${{ backend.functions.<function-name>.url }}");
 * // Returns { path: "backend.functions.<function-name>", field: "url" }
 *
 * @example
 * parseConfigurationVariable("${{ env.MY_ENV_VAR }}");
 * // Returns { key: "MY_ENV_VAR" }
 *
 * @example
 * parseConfigurationVariable("my-value");
 * // Returns { value: "my-value" }
 */
export async function parseConfigurationVariable(rawValue: string): Promise<ConfigurationVariable> {
    const prefix = "${{";
    const suffix = "}}";

    const sanitizeVariable = (variable: string): string =>
        variable.slice(prefix.length, -suffix.length).replace(/\s/g, "");

    // Format: ${{ env.<variable> }}
    const regexEnv = /\$\{\{[ ]*env\.[ a-zA-Z0-9-._]+\}\}/;
    const matchEnv = rawValue.match(regexEnv);
    if (matchEnv) {
        const variable = sanitizeVariable(matchEnv[0]);
        // Split the string at the first period to get <variable>
        const firstDotIndex = variable.indexOf(".");
        const key = variable.substring(firstDotIndex + 1);
        return { key };
    }

    // Format: ${{ backend.functions.<function-name>.url }}
    const regex = /\$\{\{[ a-zA-Z0-9-._]+\}\}/;
    const match = rawValue.match(regex);
    if (match) {
        // Sanitize the variable
        const variable = sanitizeVariable(match[0]);
        // Split the string at the last period to get the path `backend.functions.<function-name>` and field `url`
        const lastDotIndex = variable.lastIndexOf(".");
        const path = variable.substring(0, lastDotIndex);
        const field = variable.substring(lastDotIndex + 1);
        return { path, field };
    }

    return { value: rawValue };
}

export async function expandEnvironmentVariables(
    environment: Record<string, string> | undefined,
    configuration: YamlProjectConfiguration,
    stage: string,
    envFile?: string,
    options?: {
        isLocal?: boolean;
        port?: number;
    },
): Promise<Record<string, string>> {
    if (!environment) {
        return {};
    }

    const resolveValue = (key: string) =>
        evaluateResource(
            configuration,
            ["remoteResourceReference", "literalValue"],
            environment[key],
            stage,
            envFile,
            options,
        );

    const entries = await Promise.all(
        Object.entries(environment).map(async ([key]) => [key, await resolveValue(key)]),
    );

    return Object.fromEntries(entries);
}

/**
 * Detects if an environment variables file exists at the given path.
 * @param path The path to the environment variables file.
 *
 * @returns A boolean indicating if the file exists.
 */
export async function detectEnvironmentVariablesFile(path: string) {
    return await fileExists(path);
}

/**
 * Prompts the user to confirm setting the detected environment variables.
 *
 * @param envVars The list of environment variables to set.
 * @returns A boolean indicating if the user confirmed setting the environment variables.
 */
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

export async function warningMissingEnvironmentVariables(
    cwd: string,
    projectId: string,
    projectEnvId: string,
) {
    const envFileFullPath = path.join(cwd, ".env");
    if (!(await fileExists(envFileFullPath))) {
        return;
    }
    const envVars = await readEnvironmentVariablesFile(envFileFullPath);
    if (envVars.length === 0) {
        return;
    }

    const missingEnvVars = await getUnsetEnvironmentVariables(
        envVars.map((envVar) => envVar.name),
        projectId,
        projectEnvId,
    );

    if (missingEnvVars.length === 0) {
        return;
    }
    log.warn(
        `Environment variables ${missingEnvVars.join(", ")} are not set remotely. Please set them using the dashboard ${colors.cyan(
            DASHBOARD_URL,
        )}`,
    );
}

/**
 * Gets the list of environment variables that were found locally but not set remotely.
 *
 * @param local The list of environment variables found locally.
 * @param projectId The project ID.
 * @param projectEnvId The project environment ID.
 * @returns The list of environment variables that were found locally but not set remotely.
 */
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

/**
 * Finds an environment variables file in the given directory.
 * @param cwd The directory to search for the environment variables file.
 * @returns The path to the environment variables file.
 */
export async function findAnEnvFile(cwd: string): Promise<string | undefined> {
    // These are the most common locations for the .env file
    const possibleEnvFilePath = ["server/.env", ".env"];

    for (const envFilePath of possibleEnvFilePath) {
        const fullPath = path.join(cwd, envFilePath);
        if (await fileExists(fullPath)) {
            return fullPath;
        }
    }

    return undefined;
}
