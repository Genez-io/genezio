import { spawn } from "child_process";
import { UserError } from "../errors.js";
import colors from "colors";
import _ from "lodash";
import { Logger } from "tslog";
import {
    AuthenticationConfiguration,
    DatabaseConfiguration,
    FunctionConfiguration,
} from "../models/projectConfiguration.js";
import { YamlProjectConfiguration } from "../projectConfiguration/yaml/v2.js";
import { FunctionType } from "../projectConfiguration/yaml/models.js";
import getProjectInfoByName from "../requests/getProjectInfoByName.js";
import { execaCommand } from "execa";
import { ENVIRONMENT, PORT_LOCAL_ENVIRONMENT } from "../constants.js";
import { getDatabaseByName } from "../requests/database.js";
import { getAuthentication } from "../requests/authentication.js";

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
        typeof (potentialFunctionObject as FunctionConfiguration).entry === "string" &&
        Object.values(FunctionType).includes(
            (potentialFunctionObject as FunctionConfiguration).type,
        )
    );
}

/**
 * Determines whether a given value is a valid `DatabaseConfiguration` object.
 *
 * This type guard checks whether the provided value is an instance of
 * `DatabaseConfiguration` and whether it conforms to the expected structure.
 *
 * @param potentialDatabaseObject The value to be checked, of an unknown type.
 * @returns `true` if the value is a `DatabaseConfiguration`, otherwise `false`.
 */
function isDatabaseObject(
    potentialDatabaseObject: unknown,
): potentialDatabaseObject is DatabaseConfiguration {
    return (
        typeof potentialDatabaseObject === "object" &&
        potentialDatabaseObject !== null &&
        typeof (potentialDatabaseObject as DatabaseConfiguration).name === "string" &&
        typeof (potentialDatabaseObject as DatabaseConfiguration).region === "string"
    );
}

function isAuthenticationObject(
    potentialAuthenticationObject: unknown,
): potentialAuthenticationObject is AuthenticationConfiguration {
    return (
        typeof potentialAuthenticationObject === "object" &&
        potentialAuthenticationObject !== null &&
        typeof (potentialAuthenticationObject as AuthenticationConfiguration).database ===
            "object" &&
        (potentialAuthenticationObject as AuthenticationConfiguration).database !== null
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
            throw new UserError(
                `The attribute ${key} from ${path} is not supported or does not exist in the given resource.`,
            );
        }
    }

    if (isFunctionConfiguration(resourceObject) && path.startsWith("backend.functions")) {
        const functionObj = resourceObject as FunctionConfiguration;

        // Retrieve custom output fields for a function object such as `url`
        if (field === "url") {
            if (options?.isLocal) {
                return `http://localhost:${options.port}/.functions/function-${functionObj.name}`;
            }

            const response = await getProjectInfoByName(configuration.name).catch((error) => {
                throw new UserError(
                    `Failed to retrieve the project ${configuration.name} with error: ${error}. You cannot use the url attribute.`,
                );
            });
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

    if (isDatabaseObject(resourceObject) && path.startsWith("services.databases")) {
        const databaseObj = resourceObject as DatabaseConfiguration;
        if (field === "uri") {
            const databaseName = databaseObj.name;
            const databaseResponse = await getDatabaseByName(databaseName);
            if (!databaseResponse?.connectionUrl) {
                throw new UserError(
                    `Cannot retrieve the connection URL for the database ${databaseObj.name}.`,
                );
            }

            return databaseResponse?.connectionUrl;
        }

        const inputField = databaseObj[field as keyof DatabaseConfiguration];

        if (inputField === undefined) {
            throw new UserError(
                `The attribute ${field} is not supported for database ${databaseObj.name}. You can use one of the following attributes: ${Object.keys(databaseObj).join(", ")} and uri.`,
            );
        }
        return inputField;
    }

    if (isAuthenticationObject(resourceObject) && path.startsWith("services.authentication")) {
        const authenticationObj = resourceObject as AuthenticationConfiguration;

        if (field === "token") {
            const response = await getProjectInfoByName(configuration.name).catch(() => {
                throw new UserError(
                    `Failed to retrieve the project ${configuration.name}. You cannot use the token attribute.`,
                );
            });
            const projectEnv = response.projectEnvs.find((env) => env.name === stage);
            if (!projectEnv) {
                throw new UserError(`The stage ${stage} is not found in the project.`);
            }
            const authenticationResponse = await getAuthentication(projectEnv?.id);

            return authenticationResponse?.token;
        }

        if (field === "region") {
            const response = await getProjectInfoByName(configuration.name).catch(() => {
                throw new UserError(
                    `Failed to retrieve the project ${configuration.name}. You cannot use the region attribute.`,
                );
            });
            const projectEnv = response.projectEnvs.find((env) => env.name === stage);
            if (!projectEnv) {
                throw new UserError(`The stage ${stage} is not found in the project.`);
            }
            if (ENVIRONMENT === "dev") {
                return "dev-fkt";
            }
            const authenticationResponse = await getAuthentication(projectEnv?.id);

            return authenticationResponse?.region;
        }

        const inputField = authenticationObj[field as keyof AuthenticationConfiguration];

        if (inputField === undefined) {
            throw new UserError(
                `The attribute ${field} is not supported for authentication. You can use one of the following attributes: ${Object.keys(authenticationObj).join(", ")}, token and region.`,
            );
        }
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

export async function runScript(
    scripts: string | string[] | undefined,
    cwd: string,
    environment?: Record<string, string>,
): Promise<void> {
    if (!scripts) {
        return;
    }

    if (!Array.isArray(scripts)) {
        scripts = [scripts];
    }

    for (const script of scripts) {
        await execaCommand(script, { cwd, shell: true, env: environment });
    }
}

const frontendLogsColors = {
    order: [colors.magenta, colors.yellow, colors.green, colors.red],
    index: 0,
};

export async function runFrontendStartScript(
    scripts: string | string[] | undefined,
    cwd: string,
    environment?: Record<string, string>,
): Promise<void> {
    if (!scripts) {
        return;
    }

    if (!Array.isArray(scripts)) {
        scripts = [scripts];
    }

    const logColor =
        frontendLogsColors.order[frontendLogsColors.index++ % frontendLogsColors.order.length];

    const frontendLogger = new Logger({ name: "frontendLogger", prettyLogTemplate: "" });

    let debounceCount = 0;
    let logsBuffer: Buffer[] = [];
    // A debounce is needed when logs are printed on `data` event because the logs are printed in chunks.
    // We want to print chunk of logs together if they are printed within a short time frame.
    const debouncedLog = _.debounce(() => {
        debounceCount = 0;
        if (logsBuffer.length === 0) return;

        const logs = Buffer.concat(logsBuffer).toString().trim();
        frontendLogger.info(
            `${logColor(`[Frontend logs, path: ${cwd}]\n| `)}${logs.split("\n").join(`\n${logColor("| ")}`)}`,
        );
        logsBuffer = [];
    }, 400);

    const printFrontendLogs = (logChunk: Buffer) => {
        logsBuffer.push(logChunk);

        debounceCount += 1;
        // If we have 5 debounces, we should flush the logs
        if (debounceCount >= 5) {
            debouncedLog.flush();
            return;
        }

        debouncedLog();
    };

    for (const script of scripts) {
        await new Promise<void>((resolve, reject) => {
            const child = spawn(script, {
                cwd,
                shell: true,
                stdio: "pipe",
                env: { ...process.env, ...environment },
            });

            child.stderr.on("data", printFrontendLogs);
            child.stdout.on("data", printFrontendLogs);

            child.on("error", (error) => {
                reject(`Failed to run script: ${script} - ${error}`);
            });

            child.on("exit", (code) => {
                if (code !== 0 && code !== null) {
                    reject(`Failed to run script: ${script} - the process exit code is: ${code}`);
                }
                resolve();
            });
        }).catch((error) => {
            throw new UserError(error);
        });
    }
}
