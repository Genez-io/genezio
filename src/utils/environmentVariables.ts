import { EnvironmentVariable } from "../models/environmentVariables.js";
import { log } from "./logging.js";
import dotenv from "dotenv";

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
export async function parseConfigurationVariable(
    rawValue: string,
): Promise<{ path: string; field: string } | { key: string } | { value: string }> {
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

export async function readEnvironmentVariablesFromFile(
    envFilePath: string,
    filterKey?: string,
): Promise<EnvironmentVariable[] | EnvironmentVariable> {
    const envVars = new Array<EnvironmentVariable>();

    const dotenvVars = dotenv.config({ path: envFilePath }).parsed;
    if (!dotenvVars) {
        log.warn(`Environment variables could not be read from file: ${envFilePath}`);
    }

    if (filterKey) {
        const value = dotenvVars?.[filterKey];
        return {
            name: filterKey,
            value: value || "",
        };
    }

    for (const [key, value] of Object.entries(dotenvVars || {})) {
        envVars.push({ name: key, value: value });
    }

    return envVars;
}
