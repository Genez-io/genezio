import { UserError } from "../errors.js";
import { GenezioDatabaseOptions } from "../models/commandOptions.js";
import { log } from "../utils/logging.js";
import { createDatabase, getConnectionUrl, listDatabases } from "../requests/database.js";
import { YamlConfigurationIOController } from "../projectConfiguration/yaml/v2.js";
import { CreateDatabaseRequest } from "../models/requests.js";
import { DatabaseType } from "../projectConfiguration/yaml/models.js";

export async function listDatabasesCmd(_: GenezioDatabaseOptions) {
    const response = await listDatabases();
    if (!response) {
        throw new UserError(`Failed to retrieve databases`);
    }
    log.info(JSON.stringify(response, null, 2));
    return;
}

export async function getDatabaseConnectionCmd(options: GenezioDatabaseOptions) {
    if (!options.id) {
        throw new UserError(`Database ID is required`);
    }
    const response = await getConnectionUrl(options.id);
    if (!response) {
        throw new UserError(`Failed to retrieve databases`);
    }
    log.info(JSON.stringify(response, null, 2));
    return;
}

export async function createDatabaseCmd(options: GenezioDatabaseOptions) {
    if (!options.name) {
        throw new UserError(`Database name is required`);
    }
    const configIOController = new YamlConfigurationIOController(options.config);
    const config = await configIOController.read();

    const database = config.services?.databases?.find((db) => db.name === options.name);
    if (!database) {
        throw new UserError(`Database ${options.name} not found in configuration.`);
    }

    let createdDatabaseRequest: CreateDatabaseRequest = {
        name: database.name,
        region: database.region || config.region,
        type: database.type,
    };
    if (database.type === DatabaseType.mongo) {
        createdDatabaseRequest = {
            ...createdDatabaseRequest,
            clusterType: database.clusterType,
            clusterName: database.clusterName,
            clusterTier: database.clusterTier,
        };
    }

    const response = await createDatabase(createdDatabaseRequest, undefined, undefined, false);
    if (!response) {
        throw new UserError(`Failed to create database ${options.name}`);
    }
    log.info(`Request to create database ${response.databaseId} was successfully sent.`);

    return;
}
