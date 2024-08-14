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
import getProjectInfoByName from "../../requests/getProjectInfoByName.js";
import { createEmptyProject } from "../../requests/project.js";
import { debugLogger } from "../../utils/logging.js";
import { parseRawVariable, resolveConfigurationVariable } from "../../utils/scripts.js";

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
            );
            debugLogger.debug(
                `The key ${key} with value ${rawValue} contains a variable with the format $\{{<variable>}}. The evaluated value ${resolvedValue} is being set.`,
            );
            newEnvObject[key] = resolvedValue;
        }
    }

    return newEnvObject;
}
