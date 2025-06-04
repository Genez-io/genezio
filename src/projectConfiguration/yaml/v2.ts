import { YAMLContext, parse as parseYaml, stringify as stringifyYaml } from "yaml-transmute";
import zod from "zod";
import nativeFs from "fs";
import { IFs } from "memfs";
import { neonDatabaseRegions, legacyRegions, mongoDatabaseRegions } from "../../utils/configs.js";
import { GENEZIO_CONFIGURATION_FILE_NOT_FOUND, UserError, zodFormatError } from "../../errors.js";
import {
    AuthenticationDatabaseType,
    DatabaseType,
    FunctionType,
    InstanceSize,
    Language,
} from "./models.js";
import {
    FUNCTION_EXTENSIONS,
    supportedArchitectures,
    supportedNodeRuntimes,
    supportedPythonRuntimes,
} from "../../models/projectOptions.js";
import { PackageManagerType } from "../../packageManagers/packageManager.js";
import { TriggerType } from "./models.js";
import { isValidCron } from "cron-validator";
import { tryV2Migration } from "./migration.js";
import yaml, { YAMLParseError } from "yaml";
import { DeepRequired } from "../../utils/types.js";
import { isUnique } from "../../utils/yaml.js";
import path from "path";
import { MongoClusterTier, MongoClusterType } from "../../models/requests.js";

export type RawYamlProjectConfiguration = ReturnType<typeof parseGenezioConfig>;
export type YAMLBackend = NonNullable<YamlProjectConfiguration["backend"]>;
export type YAMLService = NonNullable<YamlProjectConfiguration["services"]>;
export type YAMLLanguage = NonNullable<YAMLBackend["language"]>;
export type YAMLLanguageRuntime = NonNullable<YAMLLanguage["runtime"]>;
export type YamlClass = NonNullable<YAMLBackend["classes"]>[number];
export type YamlFunction = NonNullable<YAMLBackend["functions"]>[number];
export type YamlServices = NonNullable<YamlProjectConfiguration["services"]>;
export type YamlCron = NonNullable<YamlServices["crons"]>[number];
export type YamlMethod = NonNullable<YamlClass["methods"]>[number];
export type YamlFrontend = NonNullable<YamlProjectConfiguration["frontend"]>[number];
export type YamlContainer = NonNullable<YamlProjectConfiguration["container"]>;
type YamlScripts = NonNullable<YAMLBackend["scripts"]> | NonNullable<YamlFrontend["scripts"]>;
export type YamlScript = YamlScripts[keyof YamlScripts];

export type YamlProjectConfiguration = ReturnType<typeof fillDefaultGenezioConfig>;
export type YamlDatabase = NonNullable<
    NonNullable<YamlProjectConfiguration["services"]>["databases"]
>[number];

function parseGenezioConfig(config: unknown) {
    const languageSchema = zod.object({
        name: zod.nativeEnum(Language),
        runtime: zod.enum([...supportedNodeRuntimes, ...supportedPythonRuntimes]).optional(),
        architecture: zod.enum(supportedArchitectures).optional(),
        packageManager: zod.nativeEnum(PackageManagerType).optional(),
    });

    const scriptSchema = zod.array(zod.string()).or(zod.string()).optional();

    const environmentSchema = zod.record(zod.string(), zod.string());

    const methodSchema = zod
        .object({
            name: zod.string(),
            type: zod.literal(TriggerType.jsonrpc).or(zod.literal(TriggerType.http)),
            auth: zod.boolean().optional(),
        })
        .or(
            zod
                .object({
                    name: zod.string(),
                    type: zod.literal(TriggerType.cron),
                    cronString: zod.string(),
                    auth: zod.boolean().optional(),
                })
                .refine(({ type, cronString }) => {
                    if (type === TriggerType.cron && cronString && !isValidCron(cronString)) {
                        return false;
                    }

                    return true;
                }, "The cronString is not valid. Check https://crontab.guru/ for more information.")
                .refine(({ type, cronString }) => {
                    const cronParts = cronString?.split(" ");
                    if (
                        type === TriggerType.cron &&
                        cronParts &&
                        cronParts[2] != "*" &&
                        cronParts[4] != "*"
                    ) {
                        return false;
                    }

                    return true;
                }, "The day of the month and day of the week cannot be specified at the same time."),
        );

    const classSchema = zod.object({
        name: zod.string().optional(),
        path: zod.string(),
        type: zod.nativeEnum(TriggerType).optional(),
        methods: zod.array(methodSchema).optional(),
        timeout: zod.number().optional(),
        storageSize: zod.number().optional(),
        instanceSize: zod.nativeEnum(InstanceSize).optional(),
        vcpuCount: zod.number().optional(),
        memoryMb: zod.number().optional(),
        maxConcurrentRequestsPerInstance: zod
            .number()
            .optional()
            .refine((value) => {
                if (value && value < 1) {
                    return false;
                }
                return true;
            }, "The maximum number of concurrent requests per instance should be greater than 0."),
        maxConcurrentInstances: zod
            .number()
            .optional()
            .refine((value) => {
                if (value && value < 1) {
                    return false;
                }
                return true;
            }, "The maximum number of concurrent instances should be greater than 0."),
        cooldownTime: zod.number().optional(),
        persistent: zod.boolean().optional(),
    });

    const functionsSchema = zod
        .object({
            name: zod.string().refine((value) => {
                const nameRegex = new RegExp("^[a-zA-Z][-a-zA-Z0-9]*$");
                return nameRegex.test(value);
            }, "Must start with a letter and contain only letters, numbers and dashes."),
            path: zod.string(),
            // handler is mandatory only if type is AWS
            handler: zod.string().optional(),
            entry: zod.string().refine((value) => {
                const filename = path.basename(value);
                return (
                    filename.split(".").length === 2 &&
                    FUNCTION_EXTENSIONS.includes(filename.split(".")[1])
                );
            }, "The handler should be in the format 'file.extension'. example: index.js / index.mjs / index.cjs / index.py"),
            type: zod.nativeEnum(FunctionType).default(FunctionType.aws),
            timeout: zod.number().optional(),
            storageSize: zod.number().optional(),
            instanceSize: zod.nativeEnum(InstanceSize).optional(),
            vcpuCount: zod.number().optional(),
            memoryMb: zod.number().optional(),
            maxConcurrentRequestsPerInstance: zod
                .number()
                .optional()
                .refine((value) => {
                    if (value && value < 1) {
                        return false;
                    }
                    return true;
                }, "The maximum number of concurrent requests per instance should be greater than 0."),
            maxConcurrentInstances: zod
                .number()
                .optional()
                .refine((value) => {
                    if (value && value < 1) {
                        return false;
                    }
                    return true;
                }, "The maximum number of concurrent instances should be greater than 0."),
            cooldownTime: zod.number().optional(),
            healthcheckPath: zod.string().optional(),
        })
        .refine(
            ({ type, handler }) => !(type === FunctionType.aws && !handler),
            "The handler is mandatory for type aws functions.",
        )
        .refine(
            ({ type, healthcheckPath }) => !(type !== FunctionType.persistent && healthcheckPath),
            "The healthcheckPath field is only supported for persistent functions.",
        );

    const databaseSchema = zod
        .object({
            name: zod.string(),
            type: zod.literal(DatabaseType.neon),
            region: zod
                .enum(neonDatabaseRegions.map((r) => r.value) as [string, ...string[]])
                .optional(),
        })
        .or(
            zod.object({
                name: zod.string(),
                type: zod.literal(DatabaseType.mongo),
                region: zod
                    .enum(mongoDatabaseRegions.map((r) => r.value) as [string, ...string[]])
                    .optional(),
                clusterType: zod.nativeEnum(MongoClusterType).optional(),
                clusterName: zod.string().optional(),
                clusterTier: zod.nativeEnum(MongoClusterTier).optional(),
            }),
        );

    const cronSchema = zod
        .object({
            name: zod.string(),
            function: zod.string(),
            schedule: zod.string(),
            endpoint: zod.string().optional(),
        })
        .refine(({ schedule }) => {
            if (schedule && !isValidCron(schedule)) {
                return false;
            }

            return true;
        }, "The schedule expression is not valid. Please visit https://crontab.guru/ to validate it.");

    const redirectUrlSchema = zod.string();

    const authEmailSettings = zod.object({
        resetPassword: zod
            .object({
                redirectUrl: redirectUrlSchema,
            })
            .optional(),
        emailVerification: zod
            .object({
                redirectUrl: redirectUrlSchema,
            })
            .optional(),
    });

    const authenticationSchema = zod.object({
        database: zod
            .object({
                type: zod.nativeEnum(AuthenticationDatabaseType),
                uri: zod.string(),
            })
            .or(zod.object({ name: zod.string() })),
        providers: zod
            .object({
                email: zod.boolean().optional(),
                web3: zod.boolean().optional(),
                google: zod
                    .object({
                        clientId: zod.string(),
                        clientSecret: zod.string(),
                    })
                    .optional(),
            })
            .optional(),
        settings: authEmailSettings.optional(),
    });

    const servicesSchema = zod
        .object({
            databases: zod.array(databaseSchema).optional(),
            email: zod.boolean().optional(),
            authentication: authenticationSchema.optional(),
            crons: zod.array(cronSchema).optional(),
        })
        .refine(({ crons }) => {
            const isUniqueCron = isUnique(crons ?? [], "name");
            return isUniqueCron;
        }, `You can't have two crons with the same name.`);

    const backendSchema = zod
        .object({
            path: zod.string(),
            language: languageSchema,
            environment: environmentSchema.optional(),
            scripts: zod
                .object({
                    deploy: scriptSchema,
                    local: scriptSchema,
                })
                .optional(),
            classes: zod.array(classSchema).optional(),
            functions: zod.array(functionsSchema).optional(),
        })
        .refine(({ functions }) => {
            const isUniqueFunction = isUnique(functions ?? [], "name");
            return isUniqueFunction;
        }, `You can't have two functions with the same name.`);

    const frontendSchema = zod.object({
        name: zod.string().optional(),
        path: zod.string(),
        sdk: zod
            .object({
                language: zod.nativeEnum(Language),
                path: zod.string().optional(),
            })
            .optional(),
        subdomain: zod.string().optional(),
        publish: zod.string().optional(),
        environment: environmentSchema.optional(),
        scripts: zod
            .object({
                build: scriptSchema,
                start: scriptSchema,
                deploy: scriptSchema,
            })
            .optional(),
        redirects: zod
            .object({
                from: zod.string(),
                to: zod.string(),
                status: zod
                    .number()
                    .default(301)
                    .refine(
                        (status) =>
                            status === 301 ||
                            status === 302 ||
                            status === 303 ||
                            status === 307 ||
                            status === 308,
                        "The redirect status code should be 301, 302, 303, 307 or 308.",
                    ),
            })
            .array()
            .optional(),
        rewrites: zod
            .object({
                from: zod.string(),
                to: zod.string(),
            })
            .array()
            .optional(),
    });

    // Define SSR frameworks schema
    const ssrFrameworkSchema = zod.object({
        path: zod.string(),
        packageManager: zod.nativeEnum(PackageManagerType).optional(),
        scripts: zod
            .object({
                deploy: scriptSchema,
                build: scriptSchema,
                start: scriptSchema,
            })
            .optional(),
        environment: environmentSchema.optional(),
        subdomain: zod.string().optional(),
        runtime: zod.enum([...supportedNodeRuntimes, ...supportedPythonRuntimes]).optional(),
        entryFile: zod.string().optional(),
        timeout: zod.number().optional(),
        storageSize: zod.number().optional(),
        instanceSize: zod.nativeEnum(InstanceSize).optional(),
        vcpuCount: zod.number().optional(),
        memoryMb: zod.number().optional(),
        maxConcurrentRequestsPerInstance: zod
            .number()
            .optional()
            .refine((value) => {
                if (value && value < 1) {
                    return false;
                }
                return true;
            }, "The maximum number of concurrent requests per instance should be greater than 0."),
        maxConcurrentInstances: zod
            .number()
            .optional()
            .refine((value) => {
                if (value && value < 1) {
                    return false;
                }
                return true;
            }, "The maximum number of concurrent instances should be greater than 0."),
        cooldownTime: zod.number().optional(),
        type: zod.literal(FunctionType.persistent).optional(),
    });

    // Define container schema
    const containerSchema = zod
        .object({
            path: zod.string(),
            timeout: zod.number().optional(),
            storageSize: zod.number().optional(),
            instanceSize: zod.nativeEnum(InstanceSize).optional(),
            vcpuCount: zod.number().optional(),
            memoryMb: zod.number().optional(),
            maxConcurrentRequestsPerInstance: zod
                .number()
                .optional()
                .refine((value) => {
                    if (value && value < 1) {
                        return false;
                    }
                    return true;
                }, "The maximum number of concurrent requests per instance should be greater than 0."),
            maxConcurrentInstances: zod
                .number()
                .optional()
                .refine((value) => {
                    if (value && value < 1) {
                        return false;
                    }
                    return true;
                }, "The maximum number of concurrent instances should be greater than 0."),
            cooldownTime: zod.number().optional(),
            environment: environmentSchema.optional(),
            type: zod.literal(FunctionType.persistent).optional(),
            healthcheckPath: zod.string().optional(),
        })
        .refine(
            ({ type, healthcheckPath }) => !(type !== FunctionType.persistent && healthcheckPath),
            "The healthcheckPath field is only supported for persistent containers.",
        );

    const v2Schema = zod.object({
        name: zod.string().refine((value) => {
            const nameRegex = new RegExp("^[a-zA-Z][-a-zA-Z0-9]*$");
            return nameRegex.test(value);
        }, "Must start with a letter and contain only letters, numbers and dashes."),
        region: zod.enum(legacyRegions.map((r) => r.value) as [string, ...string[]]).optional(),
        yamlVersion: zod.number(),
        backend: backendSchema.optional(),
        services: servicesSchema.optional(),
        frontend: zod.array(frontendSchema).or(frontendSchema).optional(),
        nestjs: ssrFrameworkSchema.optional(),
        nextjs: ssrFrameworkSchema.optional(),
        nuxt: ssrFrameworkSchema.optional(),
        nitro: ssrFrameworkSchema.optional(),
        container: containerSchema.optional(),
        remix: ssrFrameworkSchema.optional(),
        streamlit: ssrFrameworkSchema.optional(),
    });

    const parsedConfig = v2Schema.parse(config);

    return parsedConfig;
}

function fillDefaultGenezioConfig(config: RawYamlProjectConfiguration) {
    const defaultConfig = structuredClone(config);
    defaultConfig.region ??= "us-east-1";

    if (defaultConfig.backend) {
        switch (defaultConfig.backend.language.name) {
            case Language.ts:
            case Language.js:
                defaultConfig.backend.language.packageManager ??= PackageManagerType.npm;
                break;
            case Language.python:
            case Language.pythonAsgi:
                defaultConfig.backend.language.packageManager ??= PackageManagerType.pip;
                break;
        }
    }

    if (defaultConfig.frontend && !Array.isArray(defaultConfig.frontend)) {
        defaultConfig.frontend = [defaultConfig.frontend];
    }

    return defaultConfig as DeepRequired<
        typeof defaultConfig,
        "region" | "backend.language.packageManager" | "backend.language.architecture"
    > & {
        frontend: typeof defaultConfig.frontend;
    };
}

type Variables = Partial<{
    projectName: string;
    stage: string;
}>;

function replaceVariableInScript(script: YamlScript, variables: Variables): YamlScript {
    if (!script) {
        return script;
    }

    if (Array.isArray(script)) {
        return script.map((s) => replaceVariableInScript(s, variables)) as YamlScript;
    } else {
        let newScript = script;
        if (variables.projectName) {
            newScript = newScript.replaceAll(/\${{\s*projectName\s*}}/g, variables.projectName);
        }
        if (variables.stage) {
            newScript = newScript.replaceAll(/\${{\s*stage\s*}}/g, variables.stage);
        }

        return newScript;
    }
}

function replaceVariables(
    config: RawYamlProjectConfiguration,
    variables: Variables,
): RawYamlProjectConfiguration {
    if (config.backend?.scripts) {
        for (const [key, script] of Object.entries(config.backend.scripts)) {
            config.backend.scripts[key as keyof typeof config.backend.scripts] =
                replaceVariableInScript(script, variables);
        }
    }

    if (config.frontend) {
        if (Array.isArray(config.frontend)) {
            for (const frontend of config.frontend) {
                if (frontend.scripts) {
                    for (const [key, script] of Object.entries(frontend.scripts)) {
                        frontend.scripts[key as keyof typeof frontend.scripts] =
                            replaceVariableInScript(script, variables);
                    }
                }
            }
        } else {
            if (config.frontend.scripts) {
                for (const [key, script] of Object.entries(config.frontend.scripts)) {
                    config.frontend.scripts[key as keyof typeof config.frontend.scripts] =
                        replaceVariableInScript(script, variables);
                }
            }
        }
    }

    return config;
}

export class YamlConfigurationIOController {
    ctx: YAMLContext | undefined = undefined;
    private cachedConfig: RawYamlProjectConfiguration | undefined = undefined;
    private latestRead: Date | undefined = undefined;

    constructor(
        private filePath: string = "./genezio.yaml",
        private variables: Variables = { stage: "prod" },
        private fs: typeof nativeFs | IFs = nativeFs,
    ) {}

    /**
     * Reads the YAML project configuration from the file.
     *
     * @param fillDefaults - Whether to fill default values in the configuration. Default is true.
     * Set it to false if you want to read the real configuration just to write it back slightly modified.
     * This way you can avoid saving the default values in the file.
     * @param cache - Whether to cache the configuration. Default is true. Subsequent reads will not
     * impact performance if the configuration is not externaly changed. The cache is invalidated when
     * the file is externally modified.
     * @returns A Promise that resolves to the parsed YAML project configuration.
     */
    async read(fillDefaults?: true, cache?: boolean): Promise<YamlProjectConfiguration>;
    /**
     * Reads the YAML project configuration from the file.
     *
     * @param fillDefaults - Whether to fill default values in the configuration. Default is true.
     * Set it to false if you want to read the real configuration just to write it back slightly modified.
     * This way you can avoid saving the default values in the file.
     * @param cache - Whether to cache the configuration. Default is true. Subsequent reads will not
     * impact performance if the configuration is not externaly changed. The cache is invalidated when
     * the file is externally modified.
     * @returns A Promise that resolves to the parsed YAML project configuration.
     */
    async read(fillDefaults?: false, cache?: boolean): Promise<RawYamlProjectConfiguration>;

    async read(
        fillDefaults: boolean = true,
        cache: boolean = true,
    ): Promise<YamlProjectConfiguration | RawYamlProjectConfiguration> {
        let lastModified: Date;
        try {
            lastModified = this.fs.statSync(this.filePath).mtime;
        } catch {
            throw new UserError(GENEZIO_CONFIGURATION_FILE_NOT_FOUND);
        }

        if (this.cachedConfig && cache && this.latestRead && this.latestRead >= lastModified) {
            if (fillDefaults) {
                return fillDefaultGenezioConfig(
                    replaceVariables(structuredClone(this.cachedConfig), this.variables),
                );
            }

            return structuredClone(this.cachedConfig);
        }

        const fileContent = (await this.fs.promises.readFile(this.filePath, "utf8")) as string;
        this.latestRead = new Date();

        let rawConfig: unknown, ctx: YAMLContext | undefined;
        try {
            [rawConfig, ctx] = parseYaml(fileContent);
        } catch (e) {
            if (e instanceof YAMLParseError) {
                throw new UserError(
                    `There was a problem parsing your YAML configuration!\n${e.message}`,
                );
            }
            throw e;
        }

        let genezioConfig: RawYamlProjectConfiguration;
        try {
            genezioConfig = parseGenezioConfig(rawConfig);
        } catch (e) {
            let v2RawConfig: RawYamlProjectConfiguration | undefined = undefined;
            if (!("yamlVersion" in (rawConfig as { yamlVerson: string }))) {
                v2RawConfig = await tryV2Migration(rawConfig);
            }
            if (v2RawConfig) {
                genezioConfig = parseGenezioConfig(v2RawConfig);
                await this.fs.promises.writeFile(this.filePath, yaml.stringify(genezioConfig));
            } else {
                if (e instanceof zod.ZodError) {
                    throw new UserError(
                        `There was a problem parsing your YAML configuration!\n${zodFormatError(e)}`,
                    );
                }
                throw new UserError(`There was a problem parsing your YAML configuration!\n${e}`);
            }
        }

        this.variables.projectName = genezioConfig.name;

        // Cache the context and the checked config
        this.ctx = ctx;
        this.cachedConfig = structuredClone(genezioConfig);

        // Fill default values
        if (fillDefaults) {
            return fillDefaultGenezioConfig(replaceVariables(genezioConfig, this.variables));
        }

        return genezioConfig;
    }

    async write(data: RawYamlProjectConfiguration) {
        this.fs.writeFileSync(this.filePath, stringifyYaml(data, this.ctx));
        this.latestRead = new Date();
        this.cachedConfig = structuredClone(data);
    }
}

export default new YamlConfigurationIOController();
