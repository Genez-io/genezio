import path from "path";
import yaml from "yaml";
import { getFileDetails, writeToFile } from "../utils/file.js";
import { regions } from "../utils/configs.js";
import { isValidCron } from "cron-validator";
import { CloudProviderIdentifier } from "./cloudProviderIdentifier.js";
import { DEFAULT_NODE_RUNTIME, NodeOptions } from "./nodeRuntime.js";
import zod from "zod";
import log from "loglevel";

export enum TriggerType {
    jsonrpc = "jsonrpc",
    cron = "cron",
    http = "http",
}

interface RawYamlConfiguration {
    [key: string]:
        | string
        | number
        | boolean
        | null
        | undefined
        | RawYamlConfiguration
        | Array<RawYamlConfiguration>;
}

function zodFormatError(e: zod.ZodError) {
    let errorString = "";
    const issueMap = new Map<string, string[]>();

    for (const issue of e.issues) {
        if (issueMap.has(issue.path.join("."))) {
            issueMap.get(issue.path.join("."))?.push(issue.message);
        } else {
            issueMap.set(issue.path.join("."), [issue.message]);
        }
    }

    const formErrors = issueMap.get("");
    if (formErrors && formErrors.length > 0) {
        errorString += "Form errors:\n";
        for (const error of formErrors) {
            errorString += `\t- ${error}\n`;
        }
    }

    const fieldErrors = Array.from(issueMap.entries()).filter((entry) => entry[0] !== "");
    for (const [field, errors] of fieldErrors) {
        if (errors === undefined) continue;

        errorString += `Field \`${field}\`:\n`;
        errorString += `\t- ${errors.join("\n\t- ")}\n`;
    }

    return errorString;
}

export function getTriggerTypeFromString(string: string): TriggerType {
    if (string && !TriggerType[string as keyof typeof TriggerType]) {
        const triggerTypes: string = Object.keys(TriggerType).join(", ");
        throw new Error(
            "Specified class type for " +
                string +
                " is incorrect. Accepted values: " +
                triggerTypes +
                ".",
        );
    }

    return TriggerType[string as keyof typeof TriggerType];
}

export enum Language {
    js = "js",
    ts = "ts",
    swift = "swift",
    python = "python",
    dart = "dart",
    kt = "kotlin",
    go = "go",
}

export enum PackageManagerType {
    npm = "npm",
    yarn = "yarn",
    pnpm = "pnpm",
}

export class YamlSdkConfiguration {
    language: string;
    path: string;

    constructor(language: string, path: string) {
        this.language = language;
        this.path = path;
    }
}

export type ParsedCronFields = {
    minutes: string;
    hours: string;
    dayOfMonth: string;
    month: string;
    dayOfWeek: string;
};

export class YamlMethodConfiguration {
    name: string;
    type: TriggerType;
    cronString?: string;

    constructor(name: string, type?: TriggerType, cronString?: string) {
        this.name = name;
        this.type = type ?? TriggerType.jsonrpc;
        this.cronString = cronString;
    }
}

export class YamlClassConfiguration {
    path: string;
    type: TriggerType;
    language: string;
    name?: string;
    methods: YamlMethodConfiguration[];
    fromDecorator = false;

    constructor(
        path: string,
        type: TriggerType,
        language: string,
        methods: YamlMethodConfiguration[],
        name?: string,
        fromDecorator = false,
    ) {
        this.path = path;
        this.type = type;
        this.methods = methods;
        this.language = language;
        this.name = name;
        this.fromDecorator = fromDecorator;
    }

    getMethodType(methodName: string): TriggerType {
        const method = this.methods.find((method) => method.name === methodName);

        if (!method) {
            return this.type;
        }

        if (method && method.type) {
            return method.type;
        }

        return TriggerType.jsonrpc;
    }
}

export type YamlFrontend = {
    path: string;
    subdomain?: string;
};

export class YamlScriptsConfiguration {
    preBackendDeploy?: string;
    postBackendDeploy?: string;
    postFrontendDeploy?: string;
    preFrontendDeploy?: string;
    preStartLocal?: string;
    postStartLocal?: string;
    preReloadLocal?: string;

    constructor(
        preBackendDeploy: string,
        postBackendDeploy: string,
        postFrontendDeploy: string,
        preFrontendDeploy: string,
        preStartLocal: string,
        postStartLocal: string,
        preReloadLocal: string,
    ) {
        this.preBackendDeploy = preBackendDeploy;
        this.postBackendDeploy = postBackendDeploy;
        this.postFrontendDeploy = postFrontendDeploy;
        this.preFrontendDeploy = preFrontendDeploy;
        this.preStartLocal = preStartLocal;
        this.postStartLocal = postStartLocal;
        this.preReloadLocal = preReloadLocal;
    }
}

export class YamlPluginsConfiguration {
    astGenerator: string[];
    sdkGenerator: string[];

    constructor(astGenerator: string[], sdkGenerator: string[]) {
        this.astGenerator = astGenerator;
        this.sdkGenerator = sdkGenerator;
    }
}

export class YamlWorkspace {
    backend: string;
    frontend: string;
    rawPathBackend?: string;
    rawPathFrontend?: string;

    constructor(backend: string, frontend: string) {
        this.backend = backend;
        this.frontend = frontend;
        this.rawPathBackend = backend;
        this.rawPathFrontend = frontend;
    }
}

const supportedNodeRuntimes = ["nodejs16.x", "nodejs18.x"] as const;

export enum YamlProjectConfigurationType {
    FRONTEND,
    BACKEND,
    ROOT,
}

/**
 * This class represents the model for the YAML configuration file.
 */
export class YamlProjectConfiguration {
    name: string;
    region: string;
    language: Language;
    workspace?: YamlWorkspace;
    sdk?: YamlSdkConfiguration;
    cloudProvider?: CloudProviderIdentifier;
    options?: NodeOptions;
    classes: YamlClassConfiguration[];
    frontend?: YamlFrontend;
    scripts?: YamlScriptsConfiguration;
    plugins?: YamlPluginsConfiguration;
    packageManager?: PackageManagerType | undefined;

    constructor(
        name: string,
        region: string,
        language: Language,
        sdk: YamlSdkConfiguration | undefined = undefined,
        cloudProvider: CloudProviderIdentifier,
        classes: YamlClassConfiguration[],
        frontend: YamlFrontend | undefined = undefined,
        scripts: YamlScriptsConfiguration | undefined = undefined,
        plugins: YamlPluginsConfiguration | undefined = undefined,
        options: NodeOptions | undefined = undefined,
        workspace: YamlWorkspace | undefined = undefined,
        packageManager: PackageManagerType | undefined = undefined,
    ) {
        this.name = name;
        this.region = region;
        this.language = language;
        this.sdk = sdk;
        this.cloudProvider = cloudProvider;
        this.classes = classes;
        this.frontend = frontend;
        this.scripts = scripts;
        this.plugins = plugins;
        this.options = options;
        this.workspace = workspace;
        this.packageManager = packageManager;
    }

    getClassConfiguration(path: string): YamlClassConfiguration {
        const classConfiguration = this.classes?.find(
            (classConfiguration) => classConfiguration.path === path,
        );

        if (!classConfiguration) {
            throw new Error("Class configuration not found for path " + path);
        }

        return classConfiguration;
    }

    static async create(
        configurationFileContent: RawYamlConfiguration,
    ): Promise<YamlProjectConfiguration> {
        const methodConfigurationSchema = zod
            .object({
                name: zod.string(),
                type: zod.nativeEnum(TriggerType).optional(),
                cronString: zod.string().optional(),
            })
            .refine(({ type, cronString }) => {
                if (type === TriggerType.cron && cronString === undefined) return false;

                return true;
            }, "Cron methods must have a cronString property.")
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
            }, "The day of the month and day of the week cannot be specified at the same time.");

        const configurationFileSchema = zod.object({
            name: zod.string().refine((value) => {
                const nameRegex = new RegExp("^[a-zA-Z][-a-zA-Z0-9]*$");
                return nameRegex.test(value);
            }, "Must start with a letter and contain only letters, numbers and dashes."),
            region: zod
                .enum(regions.map((r) => r.value) as [string, ...string[]])
                .default("us-east-1"),
            language: zod.nativeEnum(Language).default(Language.ts),
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
                .default(CloudProviderIdentifier.GENEZIO),
            classes: zod
                .array(
                    zod
                        .object({
                            path: zod.string(),
                            type: zod.nativeEnum(TriggerType).default(TriggerType.jsonrpc),
                            name: zod.string().optional(),
                            methods: zod.array(methodConfigurationSchema).optional(),
                        })
                        // Hack to make sure that the method type is set to the class type
                        .transform((value) => {
                            for (const method of value.methods || []) {
                                method.type = method.type || value.type;
                            }

                            return value;
                        }),
                )
                .optional(),
            options: zod
                .object({
                    nodeRuntime: zod.enum(supportedNodeRuntimes).default(DEFAULT_NODE_RUNTIME),
                })
                .optional(),
            sdk: zod
                .object({
                    language: zod.string().refine((value) => {
                        if (!Language[value as keyof typeof Language]) {
                            log.warn(
                                `The \`sdk.language\` ${value} value, specified in your configuration, is not supported by default. It will be treated as a custom language plugin.`,
                            );
                        }

                        return true;
                    }),
                    path: zod.string(),
                })
                .optional(),
            frontend: zod
                .object({
                    path: zod.string(),
                    subdomain: zod
                        .string()
                        .optional()
                        .refine((value) => {
                            if (!value) return true;

                            const subdomainRegex = new RegExp("^[a-zA-Z0-9-]+$");
                            return subdomainRegex.test(value);
                        }, "A valid subdomain only contains letters, numbers and dashes."),
                })
                .optional(),
            workspace: zod
                .object({
                    backend: zod.string(),
                    frontend: zod.string(),
                })
                .optional(),
            packageManager: zod.nativeEnum(PackageManagerType).default(PackageManagerType.npm),
            scripts: zod
                .object({
                    preBackendDeploy: zod.string().optional(),
                    postBackendDeploy: zod.string().optional(),
                    postFrontendDeploy: zod.string().optional(),
                    preFrontendDeploy: zod.string().optional(),
                    preStartLocal: zod.string().optional(),
                    postStartLocal: zod.string().optional(),
                    preReloadLocal: zod.string().optional(),
                })
                .optional(),
            plugins: zod
                .object({
                    astGenerator: zod.array(zod.string()),
                    sdkGenerator: zod.array(zod.string()),
                })
                .optional(),
        });

        let configurationFile;
        try {
            configurationFile = configurationFileSchema.parse(configurationFileContent);
        } catch (e) {
            if (e instanceof zod.ZodError) {
                throw new Error(
                    `There was a problem parsing your YAML configuration!\n${zodFormatError(e)}`,
                );
            }
            throw new Error(`There was a problem parsing your YAML configuration!\n${e}`);
        }

        const unparsedClasses = configurationFile.classes || [];
        const classes = unparsedClasses.map((classConfiguration) => {
            const methods = classConfiguration.methods || [];

            return new YamlClassConfiguration(
                classConfiguration.path,
                classConfiguration.type,
                path.parse(classConfiguration.path).ext,
                methods.map(
                    (method) =>
                        new YamlMethodConfiguration(method.name, method.type, method.cronString),
                ),
                classConfiguration.name,
            );
        });

        const workspace = configurationFile.workspace
            ? new YamlWorkspace(
                  configurationFile.workspace.backend,
                  configurationFile.workspace.frontend,
              )
            : undefined;

        return new YamlProjectConfiguration(
            configurationFile.name,
            configurationFile.region,
            configurationFile.language,
            configurationFile.sdk,
            configurationFile.cloudProvider,
            classes,
            configurationFile.frontend,
            configurationFile.scripts,
            configurationFile.plugins,
            configurationFile.options,
            workspace,
            configurationFile.packageManager,
        );
    }

    getMethodType(path: string, methodName: string): TriggerType | undefined {
        const classElement = this.classes?.find((classElement) => {
            return classElement.path === path;
        });

        return classElement?.getMethodType(methodName);
    }

    addClass(classPath: string, type: TriggerType, methods: YamlMethodConfiguration[]) {
        const language = path.parse(classPath).ext;
        this.classes?.push(new YamlClassConfiguration(classPath, type, language, methods));
    }

    // The type parameter is used only if the yaml is a root type of genezio.yaml.
    // It is used to decide if the genezio.yaml file that will be written is a frontend or
    // a root type of genezio.yaml.
    //
    // TODO: this yaml mutation is becoming a mess and we should reconsider how
    // we implement it.
    async writeToFile(path = "./genezio.yaml") {
        const content = {
            name: this.name,
            region: this.region,
            language: this.language,
            cloudProvider: this.cloudProvider ? this.cloudProvider : undefined,
            options: this.options ? this.options : undefined,
            sdk: this.sdk,
            scripts: this.scripts,
            frontend: this.frontend
                ? {
                      path: this.frontend?.path,
                      subdomain: this.frontend?.subdomain,
                  }
                : undefined,
            classes: this.classes.filter((c) => !c.fromDecorator).length
                ? this.classes?.map((c) => ({
                      path: c.path,
                      type: c.type,
                      name: c.name ? c.name : undefined,
                      methods: c.methods.map((m) => ({
                          name: m.name,
                          type: m.type,
                          cronString: m.cronString,
                      })),
                  }))
                : undefined,
            packageManager: this.packageManager ? this.packageManager : undefined,
            workspace: this.workspace
                ? {
                      backend: this.workspace.rawPathBackend,
                      frontend: this.workspace.rawPathFrontend,
                  }
                : undefined,
        };

        const fileDetails = getFileDetails(path);
        const yamlString = yaml.stringify(content);

        await writeToFile(fileDetails.path, fileDetails.filename, yamlString).catch((error) => {
            console.error(error.toString());
        });
    }

    async addSubdomain(subdomain: string) {
        this.frontend = {
            path: this.frontend?.path || "./frontend/build",
            subdomain: subdomain,
        };
        await this.writeToFile();
    }
}
