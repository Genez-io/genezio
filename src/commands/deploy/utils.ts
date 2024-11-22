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
    AuthenticationEmailTemplateType,
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
import {
    createTemporaryFolder,
    fileExists,
    readEnvironmentVariablesFile,
    zipDirectory,
} from "../../utils/file.js";
import { resolveConfigurationVariable } from "../../utils/scripts.js";
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
} from "../../utils/environmentVariables.js";
import inquirer from "inquirer";
import { existsSync, readFileSync, readdirSync } from "fs";
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
    setEmailTemplates,
} from "../../requests/authentication.js";
import { getPresignedURLForProjectCodePush } from "../../requests/getPresignedURLForProjectCodePush.js";
import { uploadContentToS3 } from "../../requests/uploadContentToS3.js";
import { displayHint, replaceExpression } from "../../utils/strings.js";
import { getPackageManager } from "../../packageManagers/packageManager.js";
import { ContainerComponentType, SSRFrameworkComponentType } from "../../models/projectOptions.js";
import gitignore from "parse-gitignore";

type DependenciesInstallResult = {
    command: string;
    args: string[];
};

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
        throw new UserError(`Failed to get project ${projectName}: ${error}`);
    });

    const projectEnv = project?.projectEnvs.find((projectEnv) => projectEnv.name == stage);
    if (!project || !projectEnv) {
        if (ask) {
            const { createProject } = await inquirer.prompt([
                {
                    type: "confirm",
                    name: "createProject",
                    message: `Project ${projectName} not found remotely. Do you want to create it?`,
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

export async function attemptToInstallDependencies(
    args: string[] = [],
    currentPath: string,
): Promise<DependenciesInstallResult> {
    const packageManager = getPackageManager();
    debugLogger.debug(
        `Attempting to install dependencies with ${packageManager.command} ${args.join(" ")}`,
    );

    try {
        await packageManager.install([], currentPath, args);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        if (errorMessage.includes("code EJSONPARSE")) {
            throw new UserError(
                `Failed to install dependencies due to an invalid package.json file. Please fix your package.json file.`,
            );
        }

        if (errorMessage.includes("code E404")) {
            const extractPackageName = getMissingPackage(errorMessage);
            throw new UserError(
                `Failed to install dependencies due to a missing package: ${extractPackageName}. Please fix your package.json file`,
            );
        }

        if (errorMessage.includes("code ETARGET")) {
            const noTargetPackage = getNoTargetPackage(errorMessage);
            throw new UserError(
                `Failed to install dependencies due to a non-existent package version: ${noTargetPackage}. Please fix your package.json file`,
            );
        }

        if (errorMessage.includes("code ERESOLVE") && !args.includes("--legacy-peer-deps")) {
            return attemptToInstallDependencies([...args, "--legacy-peer-deps"], currentPath);
        }

        throw new UserError(`Failed to install dependencies: ${errorMessage}`);
    }

    const command = `${packageManager.command} install${args.length ? ` ${args.join(" ")}` : ""}`;

    log.info(`Dependencies installed successfully with command: ${command}`);

    return {
        command: command,
        args: args,
    };
}

function getMissingPackage(errorMessage: string): string | null {
    const missingPackageRegex = /'([^@]+@[^']+)' is not in this registry/;
    const match = errorMessage.match(missingPackageRegex);

    return match ? match[1] : null;
}

function getNoTargetPackage(errorMessage: string): string | null {
    const noTargetPackageRegex = /No matching version found for ([^@]+@[^.]+)/;
    const match = errorMessage.match(noTargetPackageRegex);
    return match ? match[1] : null;
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
        debugLogger.debug(
            "Using a random name for the project because no `genezio.yaml` file was found.",
        );
    }

    return name;
}

/**
 * To prevent reusing an already deployed database, we will check if the database exists remotely.
 * @param prefix Prefix for the database name, usually the engine used - e.g. "postgres", "mongo"
 * @returns A unique database name
 */
export async function generateDatabaseName(prefix: string): Promise<string> {
    const defaultDatabaseName = prefix + "-" + "db";

    const databaseExists = await getDatabaseByName(defaultDatabaseName)
        .then(() => true)
        .catch(() => false);

    if (!databaseExists) {
        return defaultDatabaseName;
    }

    const generatedDatabaseName =
        prefix +
        "-" +
        uniqueNamesGenerator({
            dictionaries: [adjectives, animals],
            separator: "-",
            style: "lowerCase",
            length: 2,
        });

    return generatedDatabaseName;
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

        if (ask) {
            const { linkDatabase } = await inquirer.prompt([
                {
                    type: "confirm",
                    name: "linkDatabase",
                    message: `Database ${createDatabaseReq.name} is not linked. Do you want to link it to stage ${stage}?`,
                    default: false,
                },
            ]);

            if (!linkDatabase) {
                log.warn(
                    `Database ${createDatabaseReq.name} is not linked and you chose not to link it.`,
                );
                return undefined;
            }
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
                message: `Database ${createDatabaseReq.name} not found remotely. Do you want to create it?`,
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
            `You can reference the connection URI in your \`genezio.yaml\` file using \${{services.databases.${createDatabaseReq.name}.uri}}`,
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

    // If authentication.providers is not set, all auth providers are disabled by default
    const authProviders = configuration.services?.authentication?.providers
        ? (configuration.services?.authentication?.providers as AuthenticationProviders)
        : {
              email: false,
              google: undefined,
              web3: false,
          };

    const authenticationStatus = await getAuthentication(projectEnvId);

    if (authenticationStatus.enabled) {
        const remoteAuthProviders = await getAuthProviders(projectEnvId);

        if (!haveAuthProvidersChanged(remoteAuthProviders.authProviders, authProviders)) {
            log.info("Authentication is already enabled.");
            log.info("The corresponding auth providers are already set.");
            return;
        }
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
    } else {
        const configDatabase = configuration.services?.databases?.find(
            (database) => database.name === authDatabase.name,
        );
        if (!configDatabase) {
            throw new UserError(ADD_DATABASE_CONFIG(authDatabase.name, configuration.region));
        }

        if (!configDatabase.region) {
            configDatabase.region = configuration.region;
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

        let databaseType;
        switch (database.type) {
            case DatabaseType.neon:
                databaseType = AuthenticationDatabaseType.postgres;
                break;
            case DatabaseType.mongo:
                databaseType = AuthenticationDatabaseType.mongo;
                break;
            default:
                throw new UserError(`Database type ${database.type} is not supported.`);
        }
        await enableAuthenticationHelper(
            {
                enabled: true,
                databaseUrl: database.connectionUrl || "",
                databaseType,
            },
            projectEnvId,
            authProviders,
            /* ask= */ ask,
        );
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
                message:
                    "Authentication is not enabled or providers are not updated. Do you want to update this service?",
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

    log.info(colors.green(`Authentication enabled successfully.`));
    return;
}

function haveAuthProvidersChanged(
    remoteAuthProviders: AuthProviderDetails[],
    authProviders: AuthenticationProviders,
): boolean {
    for (const provider of remoteAuthProviders) {
        switch (provider.name) {
            case "email":
                if (!!authProviders.email !== provider.enabled) {
                    return true;
                }
                break;
            case "web3":
                if (!!authProviders.web3 !== provider.enabled) {
                    return true;
                }
                break;
            case "google":
                if (!!authProviders.google !== provider.enabled) {
                    return true;
                }
                break;
        }
    }

    return false;
}

export async function setAuthenticationEmailTemplates(
    configuration: YamlProjectConfiguration,
    redirectUrlRaw: string,
    type: AuthenticationEmailTemplateType,
    stage: string,
    projectEnvId: string,
) {
    const redirectUrl = await evaluateResource(configuration, redirectUrlRaw, stage, undefined);

    await setEmailTemplates(projectEnvId, {
        templates: [
            {
                type: type,
                template: {
                    redirectUrl: redirectUrl,
                },
            },
        ],
    });

    type === AuthenticationEmailTemplateType.verification
        ? log.info(colors.green(`Email verification field set successfully.`))
        : log.info(colors.green(`Password reset field set successfully.`));
}

export async function evaluateResource(
    configuration: YamlProjectConfiguration,
    resource: string | undefined,
    stage: string | undefined,
    envFile: string | undefined,
    options?: {
        isLocal?: boolean;
        port?: number;
    },
): Promise<string> {
    if (!resource) {
        return "";
    }

    const resourceRaw = await parseConfigurationVariable(resource);

    if ("path" in resourceRaw && "field" in resourceRaw) {
        const resourceValue = await resolveConfigurationVariable(
            configuration,
            stage ?? "prod",
            resourceRaw.path,
            resourceRaw.field,
            options,
        );

        return replaceExpression(resource, resourceValue);
    }

    if ("key" in resourceRaw) {
        // search for the environment variable in process.env
        const resourceFromProcessValue = process.env[resourceRaw.key];
        if (resourceFromProcessValue) {
            return replaceExpression(resource, resourceFromProcessValue);
        }

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

        return replaceExpression(resource, resourceValue);
    }

    return resourceRaw.value;
}

export async function uploadEnvVarsFromFile(
    envPath: string | undefined,
    projectId: string,
    projectEnvId: string,
    cwd: string,
    stage: string,
    configuration: YamlProjectConfiguration,
    componentType: SSRFrameworkComponentType | ContainerComponentType | "backend" = "backend",
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
                        `The following environment variables were uploaded successfully: `,
                        envVarKeys.join(", "),
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

    // Select the enviroment object based on the component type (nuxt, nitro, nextjs, container, backend)
    // "backend" is the default component type
    const environment =
        {
            [ContainerComponentType.container]: configuration.container?.environment,
            [SSRFrameworkComponentType.next]: configuration.nextjs?.environment,
            [SSRFrameworkComponentType.nuxt]: configuration.nitro?.environment,
            [SSRFrameworkComponentType.nitro]: configuration.nuxt?.environment,
            backend: configuration.backend?.environment,
        }[componentType] ?? configuration.backend?.environment;

    if (environment) {
        const unsetEnvVarKeys = await getUnsetEnvironmentVariables(
            Object.keys(environment),
            projectId,
            projectEnvId,
        );

        const environmentVariablesToBePushed: EnvironmentVariable[] = (
            await Promise.all(
                unsetEnvVarKeys.map(async (envVarKey) => {
                    const value = await evaluateResource(
                        configuration,
                        environment[envVarKey],
                        stage,
                        envFile,
                    );
                    return value ? { name: envVarKey, value } : undefined;
                }),
            )
        ).filter(Boolean) as EnvironmentVariable[];

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
                const envVarKeys = environmentVariablesToBePushed.map((envVar) => envVar.name);
                log.info(
                    `The following environment variables were uploaded successfully: `,
                    envVarKeys.join(", "),
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

const excludedFiles = [
    "projectCode.zip",
    "**/projectCode.zip",
    "**/node_modules/*",
    "./node_modules/*",
    "node_modules/*",
    "**/node_modules",
    "./node_modules",
    "node_modules",
    "node_modules/**",
    "**/node_modules/**",
    // ignore all .git files
    "**/.git/*",
    "./.git/*",
    ".git/*",
    "**/.git",
    "./.git",
    ".git",
    ".git/**",
    "**/.git/**",
    // ignore all .next files
    "**/.next/*",
    "./.next/*",
    ".next/*",
    "**/.next",
    "./.next",
    ".next",
    ".next/**",
    "**/.next/**",
    // ignore all .open-next files
    "**/.open-next/*",
    "./.open-next/*",
    ".open-next/*",
    "**/.open-next",
    "./.open-next",
    ".open-next",
    ".open-next/**",
    "**/.open-next/**",
    // ignore all .vercel files
    "**/.vercel/*",
    "./.vercel/*",
    ".vercel/*",
    "**/.vercel",
    "./.vercel",
    ".vercel",
    ".vercel/**",
    "**/.vercel/**",
    // ignore all .turbo files
    "**/.turbo/*",
    "./.turbo/*",
    ".turbo/*",
    "**/.turbo",
    "./.turbo",
    ".turbo",
    ".turbo/**",
    "**/.turbo/**",
    // ignore all .sst files
    "**/.sst/*",
    "./.sst/*",
    ".sst/*",
    "**/.sst",
    "./.sst",
    ".sst",
    ".sst/**",
    "**/.sst/**",
    // ignore env files
    ".env",
    ".env.development.local",
    ".env.test.local",
    ".env.production.local",
    ".env.local",
];

type Patterns = {
    exclude: string[];
    reinclude: string[];
};

function getGitIgnorePatterns(cwd: string): Patterns {
    const gitIgnorePath = path.join(cwd, ".gitignore");
    if (existsSync(gitIgnorePath)) {
        return {
            exclude: gitignore
                .parse(readFileSync(gitIgnorePath))
                .patterns.filter((pattern) => !pattern.startsWith("!")),
            reinclude: gitignore
                .parse(readFileSync(gitIgnorePath))
                .patterns.filter((pattern) => pattern.startsWith("!"))
                .map((pattern) => pattern.slice(1)),
        };
    }

    return { exclude: [], reinclude: [] };
}

function getAllGitIgnorePatterns(cwd: string): Patterns {
    const patterns: Patterns = getGitIgnorePatterns(cwd);
    readdirSync(cwd, { withFileTypes: true }).forEach((file) => {
        if (
            file.isDirectory() &&
            !file.name.startsWith(".") &&
            !file.name.startsWith("node_modules")
        ) {
            const newPatterns = getAllGitIgnorePatterns(path.join(cwd, file.name));
            patterns.exclude = [
                ...patterns.exclude,
                ...newPatterns.exclude.map((pattern) =>
                    path.join(path.relative(cwd, path.join(cwd, file.name)), pattern),
                ),
            ];
            patterns.reinclude = [
                ...patterns.reinclude,
                ...newPatterns.reinclude.map((pattern) =>
                    path.join(path.relative(cwd, path.join(cwd, file.name)), pattern),
                ),
            ];
        }
    });
    return patterns;
}

// Upload the project code to S3 for in-browser editing
export async function uploadUserCode(
    name: string,
    region: string,
    stage: string,
    cwd: string,
): Promise<void> {
    const tmpFolderProject = await createTemporaryFolder();
    debugLogger.debug(`Creating archive of the project in ${tmpFolderProject}`);
    const { exclude, reinclude } = getAllGitIgnorePatterns(cwd);
    const promiseZip = zipDirectory(
        cwd,
        path.join(tmpFolderProject, "projectCode.zip"),
        true,
        excludedFiles.concat(exclude),
        reinclude,
    );

    await promiseZip;
    const presignedUrlForProjectCode = await getPresignedURLForProjectCodePush(region, name, stage);
    return uploadContentToS3(
        presignedUrlForProjectCode,
        path.join(tmpFolderProject, "projectCode.zip"),
    );
}
