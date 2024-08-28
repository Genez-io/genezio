import path from "path";
import { ADD_DATABASE_CONFIG, UserError } from "../../errors.js";
import { CloudProviderIdentifier } from "../../models/cloudProviderIdentifier.js";
import {
    AuthDatabaseConfig,
    AuthenticationProviders,
    AuthProviderDetails,
    CreateDatabaseRequest,
    GetDatabaseResponse,
    SetAuthenticationRequest,
    SetAuthProvidersRequest,
    YourOwnAuthDatabaseConfig,
} from "../../models/requests.js";
import {
    AuthenticationDatabaseType,
    DatabaseType,
} from "../../projectConfiguration/yaml/models.js";
import { YamlProjectConfiguration } from "../../projectConfiguration/yaml/v2.js";
import { YamlConfigurationIOController } from "../../projectConfiguration/yaml/v2.js";
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
import {
    detectEnvironmentVariablesFile,
    findAnEnvFile,
    getUnsetEnvironmentVariables,
    parseConfigurationVariable,
    promptToConfirmSettingEnvironmentVariables,
    resolveEnvironmentVariable,
} from "../../utils/environmentVariables.js";
import inquirer from "inquirer";
import { existsSync, readFileSync } from "fs";
import { checkProjectName } from "../create/create.js";
import {
    uniqueNamesGenerator,
    adjectives,
    colors as ungColors,
    animals,
} from "unique-names-generator";
import { regions } from "../../utils/configs.js";
import { EnvironmentVariable } from "../../models/environmentVariables.js";
import { isCI } from "../../utils/process.js";
import {
    getAuthentication,
    getAuthProviders,
    setAuthentication,
    setAuthProviders,
} from "../../requests/authentication.js";
import { displayHint } from "../../utils/strings.js";

export async function getOrCreateEmptyProject(
    projectName: string,
    region: string,
    stage: string = "prod",
    ask: boolean = false,
): Promise<{ projectId: string; projectEnvId: string } | undefined> {
    const project = await getProjectInfoByName(projectName).catch((error) => {
        if (error instanceof UserError && error.message.includes("record not found")) {
            return undefined;
        }
        debugLogger.debug(`Error getting project ${projectName}: ${error}`);
        throw new UserError(`Failed to get project ${projectName}.`);
    });

    const projectEnv = project?.projectEnvs.find((projectEnv) => projectEnv.name == stage);
    if (!project || !projectEnv) {
        if (ask) {
            const { createProject } = await inquirer.prompt([
                {
                    type: "confirm",
                    name: "createProject",
                    message: `Project ${projectName} not found. Do you want to create it?`,
                    default: false,
                },
            ]);
            if (!createProject) {
                log.warn(`Project ${projectName} not found and you chose not to create it.`);
                return undefined;
            }

            log.info(`Creating project ${projectName} in region ${region} on stage ${stage}...`);
        }
        const newProject = await createEmptyProject({
            projectName: projectName,
            region: region,
            cloudProvider: CloudProviderIdentifier.GENEZIO_CLOUD,
            stage: stage,
        }).catch((error) => {
            debugLogger.debug(`Error creating project ${projectName}: ${error}`);
            throw new UserError(`Failed to create project ${projectName}.`);
        });

        log.info(
            colors.green(
                `Project ${projectName} in region ${region} on stage ${stage} was created successfully`,
            ),
        );

        return { projectId: newProject.projectId, projectEnvId: newProject.projectEnvId };
    }

    return { projectId: project.id, projectEnvId: projectEnv.id };
}

export async function readOrAskConfig(configPath: string): Promise<YamlProjectConfiguration> {
    const configIOController = new YamlConfigurationIOController(configPath);
    if (!existsSync(configPath)) {
        const name = await readOrAskProjectName();

        let region = regions[0].value;
        if (!isCI()) {
            ({ region } = await inquirer.prompt([
                {
                    type: "list",
                    name: "region",
                    message: "Select the Genezio project region:",
                    choices: regions,
                },
            ]));
        } else {
            log.info(
                "Using the default region for the project because no `genezio.yaml` file was found.",
            );
        }

        await configIOController.write({ name, region, yamlVersion: 2 });
    }

    return await configIOController.read();
}

export async function readOrAskProjectName(): Promise<string> {
    if (existsSync("package.json")) {
        // Read package.json content
        const packageJson = readFileSync("package.json", "utf-8");
        const packageJsonName = JSON.parse(packageJson)["name"];

        const validProjectName: boolean = await (async () => checkProjectName(packageJsonName))()
            .then(() => true)
            .catch(() => false);

        const projectExists = await getProjectInfoByName(packageJsonName)
            .then(() => true)
            .catch(() => false);

        // We don't want to automatically use the package.json name if the project
        // exists, because it could overwrite the existing project by accident.
        if (packageJsonName !== undefined && validProjectName && !projectExists)
            return packageJsonName;
    }

    let name = uniqueNamesGenerator({
        dictionaries: [ungColors, adjectives, animals],
        separator: "-",
        style: "lowerCase",
        length: 3,
    });
    if (!isCI()) {
        // Ask for project name
        ({ name } = await inquirer.prompt([
            {
                type: "input",
                name: "name",
                message: "Enter the Genezio project name:",
                default: path.basename(process.cwd()),
                validate: (input: string) => {
                    try {
                        checkProjectName(input);
                        return true;
                    } catch (error) {
                        if (error instanceof Error) return colors.red(error.message);
                        return colors.red("Unavailable project name");
                    }
                },
            },
        ]));
    } else {
        log.info("Using a random name for the project because no `genezio.yaml` file was found.");
    }

    return name;
}

export async function getOrCreateDatabase(
    createDatabaseReq: CreateDatabaseRequest,
    stage: string,
    projectId: string,
    projectEnvId: string,
    ask: boolean = false,
): Promise<GetDatabaseResponse | undefined> {
    const database = await getDatabaseByName(createDatabaseReq.name);
    if (database) {
        debugLogger.debug(`Database ${createDatabaseReq.name} is already created.`);
        if (database.region.replace("aws-", "") !== createDatabaseReq.region) {
            log.warn(
                `Database ${createDatabaseReq.name} is created in a different region ${database.region}.`,
            );
            log.warn(
                `To change the region, you need to delete the database and create a new one at ${colors.cyan(`${DASHBOARD_URL}/databases`)}`,
            );
        }
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

        log.info(
            colors.green(
                `Database ${createDatabaseReq.name} was linked successfully to stage ${stage}`,
            ),
        );

        return database;
    }

    if (ask) {
        const { createDatabase } = await inquirer.prompt([
            {
                type: "confirm",
                name: "createDatabase",
                message: `Database ${createDatabaseReq.name} not found. Do you want to create it?`,
                default: false,
            },
        ]);

        if (!createDatabase) {
            log.warn(
                `Database ${createDatabaseReq.name} not found and you chose not to create it.`,
            );
            return undefined;
        }

        log.info(
            `Creating database ${createDatabaseReq.name} in region ${createDatabaseReq.region}...`,
        );
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
    log.info(colors.green(`Database ${createDatabaseReq.name} created successfully.`));
    log.info(
        displayHint(
            `You can reference the connection URI in your \`genezio.yaml\` file using \${{services.database.${createDatabaseReq.name}.uri}}`,
        ),
    );
    return {
        id: newDatabase.databaseId,
        name: createDatabaseReq.name,
        region: createDatabaseReq.region,
        type: createDatabaseReq.type || DatabaseType.neon,
    };
}

function isYourOwnAuthDatabaseConfig(object: unknown): object is YourOwnAuthDatabaseConfig {
    return typeof object === "object" && object !== null && "uri" in object && "type" in object;
}

export async function enableAuthentication(
    configuration: YamlProjectConfiguration,
    projectId: string,
    projectEnvId: string,
    stage: string,
    envFile: string | undefined,
    ask: boolean = false,
) {
    const authDatabase = configuration.services?.authentication?.database as AuthDatabaseConfig;
    if (!authDatabase) {
        return;
    }

    const authProviders = configuration.services?.authentication
        ?.providers as AuthenticationProviders;

    const authenticationStatus = await getAuthentication(projectEnvId);
    if (authenticationStatus.enabled) {
        debugLogger.debug("Authentication is already enabled.");
        return;
    }

    if (authProviders.google) {
        const clientId = await evaluateResource(
            configuration,
            authProviders.google?.clientId,
            stage,
            envFile,
        );
        const clientSecret = await evaluateResource(
            configuration,
            authProviders.google.clientSecret,
            stage,
            envFile,
        );

        if (!clientId || !clientSecret) {
            throw new UserError(
                "Google authentication is enabled but the client ID or client secret is missing.",
            );
        }

        authProviders.google = {
            clientId,
            clientSecret,
        };
    }

    if (isYourOwnAuthDatabaseConfig(authDatabase)) {
        const databaseUri = await evaluateResource(configuration, authDatabase.uri, stage, envFile);

        await enableAuthenticationHelper(
            {
                enabled: true,
                databaseUrl: databaseUri,
                databaseType: authDatabase.type,
            },
            projectEnvId,
            authProviders,
            /* ask= */ ask,
        );
        log.info(colors.green(`Authentication enabled with a ${authDatabase.type} database.`));
    } else {
        const configDatabase = configuration.services?.databases?.find(
            (database) => database.name === authDatabase.name,
        );
        if (!configDatabase) {
            throw new UserError(ADD_DATABASE_CONFIG(authDatabase.name, configuration.region));
        }

        const database: GetDatabaseResponse | undefined = await getOrCreateDatabase(
            {
                name: configDatabase.name,
                region: configDatabase.region,
                type: configDatabase.type,
            },
            stage,
            projectId,
            projectEnvId,
        );

        if (!database) {
            return;
        }

        await enableAuthenticationHelper(
            {
                enabled: true,
                databaseUrl: database.connectionUrl || "",
                databaseType: AuthenticationDatabaseType.postgres,
            },
            projectEnvId,
            authProviders,
            /* ask= */ ask,
        );

        log.info(colors.green(`Authentication enabled with database ${authDatabase.name}.`));
    }
}
export async function enableAuthenticationHelper(
    request: SetAuthenticationRequest,
    projectEnvId: string,
    providers?: AuthenticationProviders,
    ask: boolean = false,
): Promise<void> {
    if (ask) {
        const { enableAuthentication } = await inquirer.prompt([
            {
                type: "confirm",
                name: "enableAuthentication",
                message: "Authentication is not enabled. Do you want to enable it?",
                default: false,
            },
        ]);

        if (!enableAuthentication) {
            log.warn("Authentication is not enabled.");
            return;
        }
        log.info(`Enabling authentication...`);
    }

    await setAuthentication(projectEnvId, request);

    const authProvidersResponse = await getAuthProviders(projectEnvId);

    const providersDetails: AuthProviderDetails[] = [];

    if (providers) {
        for (const provider of authProvidersResponse.authProviders) {
            let enabled = false;
            switch (provider.name) {
                case "email": {
                    if (providers.email) {
                        enabled = true;
                    }
                    providersDetails.push({
                        id: provider.id,
                        name: provider.name,
                        enabled: enabled,
                        config: null,
                    });
                    break;
                }
                case "web3": {
                    if (providers.web3) {
                        enabled = true;
                    }
                    providersDetails.push({
                        id: provider.id,
                        name: provider.name,
                        enabled: enabled,
                        config: null,
                    });
                    break;
                }
                case "google": {
                    if (providers.google) {
                        enabled = true;
                    }

                    providersDetails.push({
                        id: provider.id,
                        name: provider.name,
                        enabled: enabled,
                        config: {
                            GNZ_AUTH_GOOGLE_ID: providers.google?.clientId || "",
                            GNZ_AUTH_GOOGLE_SECRET: providers.google?.clientSecret || "",
                        },
                    });
                    break;
                }
            }
        }

        // If providers details are updated, call the setAuthProviders method
        if (providersDetails.length > 0) {
            const setAuthProvidersRequest: SetAuthProvidersRequest = {
                authProviders: providersDetails,
            };
            await setAuthProviders(projectEnvId, setAuthProvidersRequest);

            debugLogger.debug(
                `Authentication providers: ${JSON.stringify(providersDetails)} set successfully.`,
            );
        }
    }

    return;
}

export async function evaluateResource(
    configuration: YamlProjectConfiguration,
    resource: string | undefined,
    stage: string,
    envFile: string | undefined,
): Promise<string> {
    if (!resource) {
        return "";
    }

    const resourceRaw = await parseConfigurationVariable(resource);

    if ("path" in resourceRaw && "field" in resourceRaw) {
        const resourceValue = await resolveConfigurationVariable(
            configuration,
            stage,
            resourceRaw.path,
            resourceRaw.field,
        );

        return resourceValue;
    }

    if ("key" in resourceRaw) {
        if (!envFile) {
            throw new UserError(
                `Environment variable file ${envFile} is missing. Please provide the correct path with genezio deploy --env <envFile>.`,
            );
        }
        const resourceValue = (await readEnvironmentVariablesFile(envFile)).find(
            (envVar) => envVar.name === resourceRaw.key,
        )?.value;

        if (!resourceValue) {
            throw new UserError(
                `Environment variable ${resourceRaw.key} is missing from the ${envFile} file.`,
            );
        }

        return resourceValue;
    }

    return resourceRaw.value;
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
    stage: string,
    configuration: YamlProjectConfiguration,
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
                    const envVarKeys = envVars.map((envVar) => envVar.name);
                    log.info(
                        `The following environment variables ${envVarKeys.join(", ")} were uploaded to the project successfully.`,
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
    }

    // This is best effort, we should encourage the user to use `--env <envFile>` to set the correct env file path.
    // Search for possible .env files in the project directory and use the first
    const envFile = envPath ? path.join(process.cwd(), envPath) : await findAnEnvFile(cwd);

    const environment = configuration.backend?.environment;
    if (environment) {
        const unsetEnvVarKeys = await getUnsetEnvironmentVariables(
            Object.keys(environment),
            projectId,
            projectEnvId,
        );

        const environmentVariablesToBePushed: EnvironmentVariable[] = (
            await Promise.all(
                unsetEnvVarKeys.map(async (envVarKey) => {
                    const variable = await parseConfigurationVariable(environment[envVarKey]);
                    const resolvedVariable = await resolveEnvironmentVariable(
                        configuration,
                        variable,
                        envVarKey,
                        envFile,
                        stage,
                    );
                    if (!resolvedVariable) {
                        return undefined;
                    }
                    return resolvedVariable;
                }),
            )
        ).filter((item): item is EnvironmentVariable => item !== undefined);

        if (environmentVariablesToBePushed.length > 0) {
            debugLogger.debug(
                `Uploading environment variables ${JSON.stringify(environmentVariablesToBePushed)} to project ${projectId}`,
            );
            await setEnvironmentVariables(projectId, projectEnvId, environmentVariablesToBePushed);
            debugLogger.debug(
                `Environment variables uploaded to project ${projectId} successfully.`,
            );
        }

        return;
    }

    if (!envFile) {
        return;
    }

    const envVars = await readEnvironmentVariablesFile(envFile);
    const missingEnvVars = await getUnsetEnvironmentVariables(
        envVars.map((envVar) => envVar.name),
        projectId,
        projectEnvId,
    );

    if (!isCI() && missingEnvVars.length > 0 && (await detectEnvironmentVariablesFile(envFile))) {
        debugLogger.debug(`Attempting to upload ${missingEnvVars.join(", ")} from ${envFile}.`);

        // Interactively prompt the user to confirm setting environment variables
        const confirmSettingEnvVars =
            await promptToConfirmSettingEnvironmentVariables(missingEnvVars);

        if (!confirmSettingEnvVars) {
            log.info(
                `Skipping environment variables upload. You can set them later by navigation to the dashboard ${DASHBOARD_URL}`,
            );
        } else {
            const environmentVariablesToBePushed = envVars.filter((envVar: { name: string }) =>
                missingEnvVars.includes(envVar.name),
            );

            debugLogger.debug(
                `Uploading environment variables ${JSON.stringify(environmentVariablesToBePushed)} from ${envFile} to project ${projectId}`,
            );
            await setEnvironmentVariables(
                projectId,
                projectEnvId,
                environmentVariablesToBePushed,
            ).then(async () => {
                const envVarKeys = envVars.map((envVar) => envVar.name);
                log.info(
                    `The following environment variables ${envVarKeys.join(", ")} were uploaded to the project successfully.`,
                );
                await GenezioTelemetry.sendEvent({
                    eventType: TelemetryEventTypes.GENEZIO_DEPLOY_LOAD_ENV_VARS,
                });
            });
            debugLogger.debug(
                `Environment variables uploaded to project ${projectId} successfully.`,
            );
        }
    } else if (missingEnvVars.length > 0) {
        log.warn(
            `Environment variables ${missingEnvVars.join(", ")} are not set remotely. Please set them using the dashboard ${colors.cyan(
                DASHBOARD_URL,
            )}`,
        );
    }
}
