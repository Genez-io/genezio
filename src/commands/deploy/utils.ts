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
import { ProjectDetails, ProjectDetailsEnvElement } from "../../requests/models.js";
import { createEmptyProject } from "../../requests/project.js";
import { debugLogger } from "../../utils/logging.js";

export async function getOrCreateEmptyProject(
    projectName: string,
    region: string,
    stage: string = "prod",
): Promise<{ project: ProjectDetails; projectEnv: ProjectDetailsEnvElement }> {
    const project = await getProjectInfoByName(projectName);

    if (!project) {
        try {
            await createEmptyProject({
                projectName: projectName,
                region: region,
                cloudProvider: CloudProviderIdentifier.GENEZIO_CLOUD,
                stage: stage,
            });
            debugLogger.debug(
                `Project ${projectName} in region ${region} on stage ${stage} was created successfully`,
            );
        } catch (error) {
            debugLogger.debug(`Error creating project ${projectName}: ${error}`);
            throw new UserError(`Failed to create project ${projectName}.`);
        }
    }

    const projectEnv = project.projectEnvs.find((projectEnv) => projectEnv.name == stage);
    if (!projectEnv) {
        throw new UserError(`Stage ${stage} not found in project ${projectName}.`);
    }

    return { project, projectEnv };
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
        try {
            const linkedDatabase = await findLinkedDatabase(
                createDatabaseReq.name,
                projectId,
                projectEnvId,
            );
            if (linkedDatabase) {
                debugLogger.debug(
                    `Database ${createDatabaseReq.name} is already linked to stage ${stage}`,
                );
                return linkedDatabase;
            }
            await linkDatabaseToEnvironment(projectId, projectEnvId, database.id);
            debugLogger.debug(
                `Database ${createDatabaseReq.name} was linked successfully to stage ${stage}`,
            );
        } catch (error) {
            debugLogger.debug(`Error linking database ${createDatabaseReq.name}: ${error}`);
            throw new UserError(`Failed to link database ${createDatabaseReq.name}.`);
        }

        return database;
    }

    try {
        const database = await createDatabase(createDatabaseReq, projectId, projectEnvId, true);
        debugLogger.debug(`Database ${createDatabaseReq.name} created successfully`);
        return {
            id: database.databaseId,
            name: createDatabaseReq.name,
            region: createDatabaseReq.region,
            type: createDatabaseReq.type || DatabaseType.neon,
        };
    } catch (error) {
        debugLogger.debug(`Error creating database ${createDatabaseReq.name}: ${error}`);
        throw new UserError(`Failed to create database ${createDatabaseReq.name}.`);
    }
}
