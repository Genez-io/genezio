import inquirer from "inquirer";
import { fileExists, readEnvironmentVariablesFile } from "./file.js";
import { getEnvironmentVariables } from "../requests/getEnvironmentVariables.js";
import path from "path";
import { resolveConfigurationVariable } from "./scripts.js";
import { debugLogger, log } from "./logging.js";
import { YamlProjectConfiguration } from "../projectConfiguration/yaml/v2.js";
import { EnvironmentVariable } from "../models/environmentVariables.js";

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

export async function resolveEnvironmentVariable(
    configuration: YamlProjectConfiguration,
    variable: ConfigurationVariable,
    envVarKey: string,
    envFile: string,
    stage: string,
): Promise<EnvironmentVariable | undefined> {
    if ("path" in variable && "field" in variable) {
        debugLogger.debug(
            `Resolving configuration variable for environment variable ${envVarKey} for <path>.<field> format`,
        );
        const resolvedValue = await resolveConfigurationVariable(
            configuration,
            stage,
            variable.path,
            variable.field,
        );
        return {
            name: envVarKey,
            value: resolvedValue,
        };
    } else if ("key" in variable) {
        debugLogger.debug(
            `Resolving environment variable from configuration file for ${envVarKey} for env.<key> format`,
        );
        const envVar = (await readEnvironmentVariablesFile(envFile)).find(
            (envVar) => envVar.name === variable.key,
        );
        if (envVar) {
            return {
                name: envVarKey,
                value: envVar.value,
            };
        }

        if (process.env[envVarKey]) {
            return {
                name: envVarKey,
                value: process.env[envVarKey],
            };
        }

        log.warn(`Environment variable ${envVarKey} is missing from the ${envFile} file.`);
    } else if ("value" in variable) {
        debugLogger.debug(
            `Resolving environment variable from configuration file for ${envVarKey} for cleartext`,
        );
        return {
            name: envVarKey,
            value: variable.value,
        };
    }
    return undefined;
}

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
