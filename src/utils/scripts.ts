/* eslint-disable no-console */
import { execSync, spawn } from "child_process";
import { UserError } from "../errors.js";
import colors from "colors";
import _ from "lodash";
import { Logger } from "tslog";
import { FunctionConfiguration } from "../models/projectConfiguration.js";
import { YamlProjectConfiguration } from "../projectConfiguration/yaml/v2.js";
import { FunctionType } from "../projectConfiguration/yaml/models.js";
import getProjectInfoByName from "../requests/getProjectInfoByName.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isFunctionConfiguration(value: any): value is FunctionConfiguration {
    return (
        value instanceof FunctionConfiguration ||
        (value &&
            typeof value === "object" &&
            typeof value.name === "string" &&
            typeof value.path === "string" &&
            typeof value.handler === "string" &&
            typeof value.entry === "string" &&
            Object.values(FunctionType).includes(value.type))
    );
}

export async function evaluateVariable(
    configuration: YamlProjectConfiguration,
    stage: string,
    path: string,
    field: string,
): Promise<string> {
    const keys = path.split(".");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let value: any = configuration;

    for (let i = 0; i < keys.length; i++) {
        const key = keys[i];

        if (Array.isArray(value)) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            value = value.find((item: any) => item.name === key);
        } else {
            value = value?.[key as keyof typeof value];
        }

        if (value === undefined) {
            throw new UserError(`The attribute ${key} from ${path} is not supported.`);
        }
    }

    if (isFunctionConfiguration(value)) {
        const functionObj = value as FunctionConfiguration;

        if (field === "url") {
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

    throw new UserError(`The path ${path} is not supported.`);
}

export async function parseVariable(
    rawValue: string,
): Promise<{ path: string; field: string } | undefined> {
    const regex = /\$\{\{[ a-zA-Z0-9-.]+\}\}/;
    const prefix = "${{";
    const suffix = "}}";
    const match = rawValue.match(regex);

    if (match) {
        // Sanitize the variable
        const variable = match[0].slice(prefix.length, -suffix.length).replace(/ /g, "");

        // Split the string at the last period
        const lastDotIndex = variable.lastIndexOf(".");
        const path = variable.substring(0, lastDotIndex);
        const field = variable.substring(lastDotIndex + 1);
        return { path, field };
    }

    return undefined;
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
        // await execaCommand(script, { cwd, shell: true });
        await execSync(script, {
            cwd,
            env: {
                ...process.env,
                ...environment,
            },
        });
    }
}

const frontendLogsColors = {
    order: [colors.magenta, colors.yellow, colors.green, colors.red],
    index: 0,
};

export async function runFrontendStartScript(
    scripts: string | string[] | undefined,
    cwd: string,
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
            const child = spawn(script, { cwd, shell: true, stdio: "pipe" });

            child.stderr.on("data", printFrontendLogs);
            child.stdout.on("data", printFrontendLogs);

            child.on("error", (error) => {
                reject(`Failed to run script: ${script} - ${error}`);
            });

            child.on("exit", (code) => {
                if (code !== 0 && code !== null) {
                    reject(`Failed to run script: ${script}`);
                }
                resolve();
            });
        }).catch((error) => {
            throw new UserError(error);
        });
    }
}
