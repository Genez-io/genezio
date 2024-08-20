import inquirer from "inquirer";
import { UserError } from "../../errors.js";
import { CloudProviderIdentifier } from "../../models/cloudProviderIdentifier.js";
import { CreateDatabaseRequest, GetDatabaseResponse } from "../../models/requests.js";
import { DatabaseType } from "../../projectConfiguration/yaml/models.js";
import {
    createDatabase,
    findLinkedDatabase,
    getDatabaseByName,
    linkDatabaseToEnvironment,
} from "../../requests/database.js";
import getProjectInfoByName from "../../requests/getProjectInfoByName.js";
import { createEmptyProject } from "../../requests/project.js";
import { fileExists } from "../../utils/file.js";
import { debugLogger, log } from "../../utils/logging.js";
import path from "path";
import { getProjectEnvFromProject } from "../../requests/getProjectInfo.js";
import { getEnvironmentVariables } from "../../requests/getEnvironmentVariables.js";
import colors from "colors";
import { DASHBOARD_URL } from "../../constants.js";
import { EnvironmentVariable } from "../../models/environmentVariables.js";
import {
    ConfigurationVariable,
    readEnvironmentVariablesFromFile,
} from "../../utils/environmentVariables.js";
import { resolveConfigurationVariable } from "../../utils/scripts.js";
import { YamlProjectConfiguration } from "../../projectConfiguration/yaml/v2.js";

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

// export async function setEnvironmentVariablesHelper(
//     envFile: string,
//     projectId: string,
//     stage: string,
// ) {
//     if (!(await fileExists(envFile))) {
//         log.error(`File ${envFile} does not exists. Please provide the correct path.`);
//     } else {
//         const envVars = (await readEnvironmentVariablesFromFile(envFile)) as EnvironmentVariable[];
//         const projectEnv = await getProjectEnvFromProject(projectId, stage);

//         if (!projectEnv) {
//             throw new UserError("Project environment not found.");
//         }

//         await setEnvironmentVariables(projectId, projectEnv.id, envVars)
//     }
// }

export async function getUnsetEnvironmentVariables(
    local: string[],
    projectId: string,
    projectEnvId: string,
) {
    const localEnvVars = Object.keys(local);
    const remoteEnvVars = await getEnvironmentVariables(projectId, projectEnvId);

    const missingEnvVars = localEnvVars.filter(
        (envVar) => !remoteEnvVars.find((remoteEnvVar) => remoteEnvVar.name === envVar),
    );

    debugLogger.debug(
        `The following environment variables are not set on your project: ${missingEnvVars}`,
    );

    return missingEnvVars;
}

export async function reportMissingEnvironmentVariables(
    envFile: string,
    projectId: string,
    stage: string,
) {
    const envVars = (await readEnvironmentVariablesFromFile(envFile)) as EnvironmentVariable[];
    const projectEnv = await getProjectEnvFromProject(projectId, stage);
    if (!projectEnv) {
        throw new UserError("Project environment not found.");
    }

    // get remoteEnvVars from project
    const remoteEnvVars = await getEnvironmentVariables(projectId, projectEnv.id);

    // check if all envVars from file are in remoteEnvVars
    const missingEnvVars = envVars.filter(
        (envVar) => !remoteEnvVars.find((remoteEnvVar) => remoteEnvVar.name === envVar.name),
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
            `${colors.yellow("Go to the dashboard ")}${colors.cyan(DASHBOARD_URL)} ${colors.yellow(
                "to set your environment variables or run ",
            )} ${colors.cyan(`genezio deploy --env ${relativeEnvFilePath}`)}`,
        );
        log.info("");
    }
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
