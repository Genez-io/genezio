import path from "path";
import { UserError } from "../../errors.js";
import { CloudProviderIdentifier } from "../../models/cloudProviderIdentifier.js";
import { CreateDatabaseRequest, GetDatabaseResponse } from "../../models/requests.js";
import { DatabaseType } from "../../projectConfiguration/yaml/models.js";
import { YamlProjectConfiguration } from "../../projectConfiguration/yaml/v2.js";
import {
    createDatabase,
    findLinkedDatabase,
    getDatabaseByName,
    linkDatabaseToEnvironment,
} from "../../requests/database.js";
import { DASHBOARD_URL } from "../../constants.js";
import getProjectInfoByName from "../../requests/getProjectInfoByName.js";
import { createEmptyProject } from "../../requests/project.js";
import { debugLogger } from "../../utils/logging.js";
import { parseRawVariable, resolveConfigurationVariable } from "../../utils/scripts.js";
import { fileExists, readEnvironmentVariablesFile } from "../../utils/file.js";
import { GenezioTelemetry, TelemetryEventTypes } from "../../telemetry/telemetry.js";
import { setEnvironmentVariables } from "../../requests/setEnvironmentVariables.js";
import { log } from "../../utils/logging.js";
import { AxiosError } from "axios";
import colors from "colors";
import { getEnvironmentVariables } from "../../requests/getEnvironmentVariables.js";

export async function getOrCreateEmptyProject(
    projectName: string,
    region: string,
    stage: string = "prod",
): Promise<{ projectId: string; projectEnvId: string }> {
    const project = await getProjectInfoByName(projectName).catch((error) => {
        if (error instanceof UserError && error.message.includes("record not found")) {
            return undefined;
        }
        debugLogger.debug(`Error getting project ${projectName}: ${error}`);
        throw new UserError(`Failed to get project ${projectName}.`);
    });

    if (!project) {
        const newProject = await createEmptyProject({
            projectName: projectName,
            region: region,
            cloudProvider: CloudProviderIdentifier.GENEZIO_CLOUD,
            stage: stage,
        }).catch((error) => {
            debugLogger.debug(`Error creating project ${projectName}: ${error}`);
            throw new UserError(`Failed to create project ${projectName}.`);
        });

        debugLogger.debug(
            `Project ${projectName} in region ${region} on stage ${stage} was created successfully`,
        );

        return { projectId: newProject.projectId, projectEnvId: newProject.projectEnvId };
    }

    const projectEnv = project.projectEnvs.find((projectEnv) => projectEnv.name == stage);
    if (!projectEnv) {
        throw new UserError(`Stage ${stage} not found in project ${projectName}.`);
    }

    return { projectId: project.id, projectEnvId: projectEnv.id };
}

export async function getOrCreateDatabase(
    createDatabaseReq: CreateDatabaseRequest,
    stage: string,
    projectId: string,
    projectEnvId: string,
): Promise<GetDatabaseResponse> {
    const database = await getDatabaseByName(createDatabaseReq.name);
    if (database) {
        debugLogger.debug(`Database ${createDatabaseReq.name} is already created.`);

        const linkedDatabase = await findLinkedDatabase(
            createDatabaseReq.name,
            projectId,
            projectEnvId,
        ).catch((error) => {
            debugLogger.debug(`Error finding linked database ${createDatabaseReq.name}: ${error}`);
            throw new UserError(`Failed to find linked database ${createDatabaseReq.name}.`);
        });

        if (linkedDatabase) {
            debugLogger.debug(
                `Database ${createDatabaseReq.name} is already linked to stage ${stage}`,
            );
            return linkedDatabase;
        }
        await linkDatabaseToEnvironment(projectId, projectEnvId, database.id).catch((error) => {
            debugLogger.debug(`Error linking database ${createDatabaseReq.name}: ${error}`);
            throw new UserError(`Failed to link database ${createDatabaseReq.name}.`);
        });

        debugLogger.debug(
            `Database ${createDatabaseReq.name} was linked successfully to stage ${stage}`,
        );
        return database;
    }

    const newDatabase = await createDatabase(
        createDatabaseReq,
        projectId,
        projectEnvId,
        true,
    ).catch((error) => {
        debugLogger.debug(`Error creating database ${createDatabaseReq.name}: ${error}`);
        throw new UserError(`Failed to create database ${createDatabaseReq.name}.`);
    });
    debugLogger.debug(`Database ${createDatabaseReq.name} created successfully`);
    return {
        id: newDatabase.databaseId,
        name: createDatabaseReq.name,
        region: createDatabaseReq.region,
        type: createDatabaseReq.type || DatabaseType.neon,
    };
}

export async function processYamlEnvironmentVariables(
    environment: Record<string, string>,
    configuration: YamlProjectConfiguration,
    stage: string,
    options?: {
        isLocal?: boolean;
        port?: number;
    },
): Promise<Record<string, string>> {
    const newEnvObject: Record<string, string> = {};

    for (const [key, rawValue] of Object.entries(environment)) {
        const variable = await parseRawVariable(rawValue);

        if (!variable) {
            debugLogger.debug(
                `The key ${key} with value ${rawValue} does not contain a variable with the format $\{{<variable>}}. The raw value is being set.`,
            );
            newEnvObject[key] = rawValue;
        } else {
            const resolvedValue = await resolveConfigurationVariable(
                configuration,
                stage,
                variable?.path,
                variable?.field,
                options,
            );
            debugLogger.debug(
                `The key ${key} with value ${rawValue} contains a variable with the format $\{{<variable>}}. The evaluated value ${resolvedValue} is being set.`,
            );
            newEnvObject[key] = resolvedValue;
        }
    }

    return newEnvObject;
}

export async function uploadEnvVarsFromFile(
    envPath: string | undefined,
    projectId: string,
    projectEnvId: string,
    cwd: string,
) {
    if (envPath) {
        const envFile = path.join(process.cwd(), envPath);
        debugLogger.debug(`Loading environment variables from ${envFile}.`);

        if (!(await fileExists(envFile))) {
            // There is no need to exit the process here, as the project has been deployed
            log.error(`File ${envFile} does not exists. Please provide the correct path.`);
            await GenezioTelemetry.sendEvent({
                eventType: TelemetryEventTypes.GENEZIO_DEPLOY_ERROR,
                errorTrace: `File ${envFile} does not exists`,
            });
        } else {
            // Read environment variables from .env file
            const envVars = await readEnvironmentVariablesFile(envFile);

            // Upload environment variables to the project
            await setEnvironmentVariables(projectId, projectEnvId, envVars)
                .then(async () => {
                    debugLogger.debug(
                        `Environment variables from ${envFile} uploaded to project ${projectId}`,
                    );
                    log.info(
                        `The environment variables were uploaded to the project successfully.`,
                    );
                    await GenezioTelemetry.sendEvent({
                        eventType: TelemetryEventTypes.GENEZIO_DEPLOY_LOAD_ENV_VARS,
                    });
                })
                .catch(async (error: AxiosError) => {
                    log.error(`Loading environment variables failed with: ${error.message}`);
                    log.error(
                        `Try to set the environment variables using the dashboard ${colors.cyan(
                            DASHBOARD_URL,
                        )}`,
                    );
                    await GenezioTelemetry.sendEvent({
                        eventType: TelemetryEventTypes.GENEZIO_DEPLOY_ERROR,
                        errorTrace: error.toString(),
                    });
                });
        }
    } else {
        const envFile = path.join(cwd, ".env");
        if (await fileExists(envFile)) {
            // read envVars from file
            const envVars = await readEnvironmentVariablesFile(envFile);

            // get remoteEnvVars from project
            const remoteEnvVars = await getEnvironmentVariables(projectId, projectEnvId);

            // check if all envVars from file are in remoteEnvVars
            const missingEnvVars = envVars.filter(
                (envVar) =>
                    !remoteEnvVars.find((remoteEnvVar) => remoteEnvVar.name === envVar.name),
            );

            // Print missing env vars
            if (missingEnvVars.length > 0) {
                log.info(
                    `${colors.yellow(
                        "Warning: The following environment variables are not set on your project: ",
                    )}`,
                );
                missingEnvVars.forEach((envVar) => {
                    log.info(`${colors.yellow(envVar.name)}`);
                });

                const relativeEnvFilePath = path.join(
                    ".",
                    path.relative(path.resolve(process.cwd()), path.resolve(envFile)),
                );

                log.info("");
                log.info(
                    `${colors.yellow("Go to the dashboard ")}${colors.cyan(
                        DASHBOARD_URL,
                    )} ${colors.yellow(
                        "to set your environment variables or run ",
                    )} ${colors.cyan(`genezio deploy --env ${relativeEnvFilePath}`)}`,
                );
                log.info("");
            }
        }
    }
}
