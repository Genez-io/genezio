import { YAMLContext, parse as parseYaml, stringify as stringifyYaml } from "yaml-transmute";
import zod from "zod";
import nativeFs from "fs";
import { IFs } from "memfs";
import { regions } from "../utils/configs.js";
import { GENEZIO_CONFIGURATION_FILE_NOT_FOUND, UserError, zodFormatError } from "../errors.js";
import { Language } from "./models.js";
import { DEFAULT_NODE_RUNTIME, supportedNodeRuntimes } from "../models/nodeRuntime.js";
import { CloudProviderIdentifier } from "../models/cloudProviderIdentifier.js";
import { PackageManagerType } from "../packageManagers/packageManager.js";
import { TriggerType } from "./models.js";
import { isValidCron } from "cron-validator";
import { tryV2Migration } from "./migration.js";
import yaml from "yaml";
import { DeepRequired } from "../utils/types.js";

export type RawYamlProjectConfiguration = ReturnType<typeof parseGenezioConfig>;
export type YAMLBackend = NonNullable<YamlProjectConfiguration["backend"]>;
export type YamlClass = NonNullable<YAMLBackend["classes"]>[number];
export type YamlMethod = NonNullable<YamlClass["methods"]>[number];
export type YamlFrontend = NonNullable<YamlProjectConfiguration["frontend"]>[number];

export type YamlProjectConfiguration = ReturnType<typeof fillDefaultGenezioConfig>;

function parseGenezioConfig(config: unknown) {
    const languageSchema = zod.object({
        name: zod.nativeEnum(Language),
        runtime: zod.enum(supportedNodeRuntimes).optional(),
        packageManager: zod.nativeEnum(PackageManagerType).optional(),
    });

    const scriptSchema = zod.array(zod.string()).or(zod.string()).optional();

    const methodSchema = zod
        .object({
            name: zod.string(),
            type: zod.literal(TriggerType.jsonrpc).or(zod.literal(TriggerType.http)),
        })
        .or(
            zod
                .object({
                    name: zod.string(),
                    type: zod.literal(TriggerType.cron),
                    cronString: zod.string(),
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
    });

    const backendSchema = zod.object({
        path: zod.string(),
        language: languageSchema,
        scripts: zod
            .object({
                deploy: scriptSchema,
                local: scriptSchema,
            })
            .optional(),
        cloudProvider: zod
            .nativeEnum(CloudProviderIdentifier, {
                errorMap: (issue, ctx) => {
                    if (issue.code === zod.ZodIssueCode.invalid_enum_value) {
                        return {
                            message:
                                "Invalid enum value. The supported values are `genezio` or `selfHostedAws`.",
                        };
                    }

                    return { message: ctx.defaultError };
                },
            })
            .optional(),
        classes: zod.array(classSchema).optional(),
    });

    const frontendSchema = zod.object({
        path: zod.string(),
        language: zod.nativeEnum(Language).optional(),
        subdomain: zod.string().optional(),
        publish: zod.string().optional(),
        scripts: zod
            .object({
                build: scriptSchema,
                start: scriptSchema,
                deploy: scriptSchema,
            })
            .optional(),
    });

    const v2Schema = zod.object({
        name: zod.string().refine((value) => {
            const nameRegex = new RegExp("^[a-zA-Z][-a-zA-Z0-9]*$");
            return nameRegex.test(value);
        }, "Must start with a letter and contain only letters, numbers and dashes."),
        region: zod.enum(regions.map((r) => r.value) as [string, ...string[]]).optional(),
        yamlVersion: zod.number(),
        backend: backendSchema.optional(),
        frontend: zod.array(frontendSchema).or(frontendSchema).optional(),
    });

    return v2Schema.parse(config);
}

function fillDefaultGenezioConfig(config: RawYamlProjectConfiguration) {
    const defaultConfig = structuredClone(config);

    defaultConfig.region ??= "us-east-1";

    if (defaultConfig.backend) {
        switch (defaultConfig.backend.language.name) {
            case Language.ts:
            case Language.js:
                defaultConfig.backend.language.packageManager ??= PackageManagerType.npm;
                defaultConfig.backend.language.runtime ??= DEFAULT_NODE_RUNTIME;
        }

        defaultConfig.backend.cloudProvider ??= CloudProviderIdentifier.GENEZIO;
    }

    if (defaultConfig.frontend && !Array.isArray(defaultConfig.frontend)) {
        defaultConfig.frontend = [defaultConfig.frontend];
    }

    return defaultConfig as DeepRequired<
        typeof defaultConfig,
        | "region"
        | "backend.language.packageManager"
        | "backend.language.runtime"
        | "backend.cloudProvider"
    > & {
        frontend: typeof defaultConfig.frontend;
    };
}

export class YamlConfigurationIOController {
    ctx: YAMLContext | undefined = undefined;
    private cachedConfig: RawYamlProjectConfiguration | undefined = undefined;
    private latestRead: Date | undefined = undefined;

    constructor(
        private filePath: string = "./genezio.yaml",
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
        } catch (e) {
            throw new UserError(GENEZIO_CONFIGURATION_FILE_NOT_FOUND);
        }
        if (this.cachedConfig && cache && this.latestRead && this.latestRead >= lastModified) {
            if (fillDefaults) {
                return fillDefaultGenezioConfig(this.cachedConfig);
            }

            return structuredClone(this.cachedConfig);
        }

        const fileContent = (await this.fs.promises.readFile(this.filePath, "utf8")) as string;
        this.latestRead = lastModified;

        const [rawConfig, ctx] = parseYaml(fileContent);
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

        // Cache the context and the checked config
        this.ctx = ctx;
        this.cachedConfig = structuredClone(genezioConfig);

        // Fill default values
        if (fillDefaults) {
            return fillDefaultGenezioConfig(genezioConfig);
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
