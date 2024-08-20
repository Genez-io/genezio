import { EnvironmentVariable } from "../models/environmentVariables.js";
import { YamlProjectConfiguration } from "../projectConfiguration/yaml/v2.js";
import { debugLogger, log } from "./logging.js";
import dotenv from "dotenv";
import { getEnvironmentVariables } from "../requests/getEnvironmentVariables.js";
import { fileExists } from "./file.js";
import inquirer from "inquirer";
import { FunctionConfiguration } from "../models/projectConfiguration.js";
import { FunctionType } from "../projectConfiguration/yaml/models.js";
import { UserError } from "../errors.js";
import getProjectInfoByName from "../requests/getProjectInfoByName.js";
import { PORT_LOCAL_ENVIRONMENT } from "../constants.js";

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
 * Determines whether a given value is a valid `FunctionConfiguration` object.
 *
 * This type guard checks whether the provided value is an object that conforms
 * to the `FunctionConfiguration` interface.
 *
 * @param potentialFunctionObject The value to be checked, of an unknown type.
 * @returns `true` if the value is a `FunctionConfiguration`, otherwise `false`.
 */
function isFunctionConfiguration(
    potentialFunctionObject: unknown,
): potentialFunctionObject is FunctionConfiguration {
    return (
        typeof potentialFunctionObject === "object" &&
        potentialFunctionObject !== null &&
        typeof (potentialFunctionObject as FunctionConfiguration).name === "string" &&
        typeof (potentialFunctionObject as FunctionConfiguration).path === "string" &&
        typeof (potentialFunctionObject as FunctionConfiguration).handler === "string" &&
        typeof (potentialFunctionObject as FunctionConfiguration).entry === "string" &&
        Object.values(FunctionType).includes(
            (potentialFunctionObject as FunctionConfiguration).type,
        )
    );
}

/**
 * Determines whether a given value is an object with a specific field.
 *
 * @param obj The object to be checked.
 * @param key The field to check for.
 * @returns `true` if the object is not `null` and contains the specified field, otherwise `false`.
 */
function assertIsObjectWithField<T extends object>(obj: unknown, key: keyof T): obj is T {
    return typeof obj === "object" && obj !== null && key in obj;
}

/**
 * Resolves and retrieves a specific field value from a hierarchical configuration object.
 *
 * The function navigates through the given configuration object based on a dot-separated path
 * to locate the desired field value. It supports nested structures, including arrays, by
 * iteratively resolving each segment of the path.
 *
 * @param configuration The root configuration object of type `YamlProjectConfiguration`.
 * @param stage The stage name.
 * @param path A dot-separated string representing the path to the desired object in the configuration. e.g. "backend.functions.<function-name>""
 * @param field The specific field to retrieve from the resolved object. e.g. "url"
 * @returns A promise that resolves to the string value of the requested field.
 * @throws UserError if the path cannot be resolved, the field is not supported, or a function URL cannot be found.
 */
export async function resolveConfigurationVariable(
    configuration: YamlProjectConfiguration,
    stage: string,
    path: string /* e.g. backend.functions.<function-name> */,
    field: string /* e.g. url */,
    options?: {
        isLocal?: boolean;
        port?: number;
    },
): Promise<string> {
    if (options?.isLocal && !options?.port) {
        options.port = PORT_LOCAL_ENVIRONMENT;
    }

    const keys = path.split(".");

    // The object or value currently referenced by the path as it is traversed through the configuration
    let resourceObject: unknown = configuration;

    // Traverse the path to locate the desired object
    for (let i = 0; i < keys.length; i++) {
        const key = keys[i];

        if (Array.isArray(resourceObject)) {
            resourceObject = resourceObject.find(
                (item: { name: string | undefined }) => item.name === key,
            );
        } else {
            resourceObject = resourceObject?.[key as keyof typeof resourceObject];
        }

        if (resourceObject === undefined) {
            throw new UserError(`The attribute ${key} from ${path} is not supported.`);
        }
    }

    if (isFunctionConfiguration(resourceObject)) {
        const functionObj = resourceObject as FunctionConfiguration;

        // Retrieve custom output fields for a function object such as `url`
        if (field === "url") {
            if (options?.isLocal) {
                return `http://localhost:${options.port}/.functions/function-${functionObj.name}`;
            }

            const response = await getProjectInfoByName(configuration.name);
            const functionUrl = response.projectEnvs
                .find((env) => env.name === stage)
                ?.functions?.find((func) => func.name === "function-" + functionObj.name)?.cloudUrl;
            if (!functionUrl) {
                throw new UserError(
                    `The function ${functionObj.name} is not deployed in the stage ${stage}.`,
                );
            }
            return functionUrl;
        }
        const inputField = functionObj[field as keyof FunctionConfiguration];

        if (inputField === undefined) {
            throw new UserError(
                `The attribute ${field} is not supported for function ${functionObj.name}. You can use one of the following attributes: ${Object.keys(functionObj).join(", ")} and url.`,
            );
        }
        return inputField;
    }

    if (assertIsObjectWithField<{ [key: string]: unknown }>(resourceObject, field)) {
        const result = resourceObject[field];
        if (typeof result === "string") {
            return result;
        } else {
            throw new UserError(`The attribute ${field} is an object and not a string.`);
        }
    } else {
        throw new UserError(
            `The attribute ${field} is not supported or does not exist in the given resource.`,
        );
    }
}

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
        const envVar = (await readEnvironmentVariablesFromFile(
            envFile,
            /* filterKey */ envVarKey,
        )) as EnvironmentVariable;
        if (envVar.value !== "") {
            return envVar;
        } else if (process.env[envVarKey]) {
            return {
                name: envVarKey,
                value: process.env[envVarKey],
            };
        } else {
            log.warn(`Environment variable ${envVarKey} is missing from the ${envFile} file.`);
        }
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

export async function getUnsetEnvironmentVariables(
    local: string[],
    projectId: string,
    projectEnvId: string,
) {
    const remoteEnvVars = await getEnvironmentVariables(projectId, projectEnvId);

    const missingEnvVars = local.filter(
        (envVar) => !remoteEnvVars.find((remoteEnvVar) => remoteEnvVar.name === envVar),
    );

    debugLogger.debug(
        `The following environment variables are not set on your project: ${missingEnvVars}`,
    );

    return missingEnvVars;
}

export async function detectEnvironmentVariablesFile(path: string) {
    return await fileExists(path);
}

export async function promptToConfirmSettingEnvironmentVariables() {
    const { confirmSetEnvVars }: { confirmSetEnvVars: boolean } = await inquirer.prompt([
        {
            type: "confirm",
            name: "confirmSetEnvVars",
            message: "Do you want to automatically set the environment variables?",
            default: false,
        },
    ]);

    if (!confirmSetEnvVars) {
        return false;
    }

    return true;
}
