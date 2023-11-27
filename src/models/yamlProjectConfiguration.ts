import path from "path";
import yaml, { parse } from "yaml";
import { fileExists, getFileDetails, readUTF8File, writeToFile } from "../utils/file.js";
import { regions } from "../utils/configs.js";
import { isValidCron } from "cron-validator";
import log from "loglevel";
import { CloudProviderIdentifier, cloudProviders } from "./cloudProviderIdentifier.js";
import { NodeOptions } from "./nodeRuntime.js";

export enum TriggerType {
    jsonrpc = "jsonrpc",
    cron = "cron",
    http = "http",
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
}

export enum PackageManagerType {
    npm = "npm",
    yarn = "yarn",
    pnpm = "pnpm",
}

export class YamlSdkConfiguration {
    language: Language;
    path: string;

    constructor(language: Language, path: string) {
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

    static async create(
        methodConfigurationYaml: any,
        classType: TriggerType,
    ): Promise<YamlMethodConfiguration> {
        if (!methodConfigurationYaml.name) {
            throw new Error("Missing method name in configuration file.");
        }

        if (
            methodConfigurationYaml.type &&
            !TriggerType[methodConfigurationYaml.type as keyof typeof TriggerType]
        ) {
            throw new Error("The method's type is incorrect.");
        }

        let type = classType;
        if (methodConfigurationYaml.type) {
            type = TriggerType[methodConfigurationYaml.type as keyof typeof TriggerType];
        }

        if (type == TriggerType.cron && !methodConfigurationYaml.cronString) {
            throw new Error("The cron method is missing a cron string property.");
        }

        // Check cron string format
        if (type == TriggerType.cron) {
            if (!isValidCron(methodConfigurationYaml.cronString)) {
                throw new Error(
                    "The cron string is not valid. Check https://crontab.guru/ for more information.",
                );
            }

            const cronParts = methodConfigurationYaml.cronString.split(" ");
            if (cronParts[2] != "*" && cronParts[4] != "*") {
                throw new Error(
                    "The cron string is not valid. The day of the month and day of the week cannot be specified at the same time.",
                );
            }
        }

        return new YamlMethodConfiguration(
            methodConfigurationYaml.name,
            type,
            methodConfigurationYaml.cronString,
        );
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

    static async create(classConfigurationYaml: any): Promise<YamlClassConfiguration> {
        if (!classConfigurationYaml.path) {
            throw new Error("Path is missing from class.");
        }

        let triggerType = TriggerType.jsonrpc;

        if (classConfigurationYaml.type) {
            triggerType = getTriggerTypeFromString(classConfigurationYaml.type);
        }

        const unparsedMethods: any[] = classConfigurationYaml.methods || [];
        const methods = await Promise.all(
            unparsedMethods.map((method: any) =>
                YamlMethodConfiguration.create(method, triggerType),
            ),
        );
        const language = path.parse(classConfigurationYaml.path).ext;

        return new YamlClassConfiguration(
            classConfigurationYaml.path,
            triggerType,
            language,
            methods,
            classConfigurationYaml.name,
        );
    }
}

export type YamlFrontend = {
    path: string;
    subdomain: string | undefined;
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
    rawPathBackend: string;
    rawPathFrontend: string;

    constructor(backend: string, frontend: string) {
        this.backend = path.resolve(backend);
        this.frontend = path.resolve(frontend);
        this.rawPathBackend = backend;
        this.rawPathFrontend = frontend;
    }
}

const supportedNodeRuntimes: string[] = ["nodejs16.x", "nodejs18.x"];

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

    static async parseBackendYaml(workspace: any) {
        if (!fileExists(workspace.backend)) {
            throw new Error(
                `The folder ${workspace.backend} specified in genezio.yaml in workspace.backend does not exist.`,
            );
        }
        let backendFileContent;
        try {
            const backendFileContentUTF8 = await readUTF8File(
                path.join(workspace.backend, "genezio.yaml"),
            );
            backendFileContent = parse(backendFileContentUTF8);
        } catch {
            return {
                classes: [],
            };
        }
        let classes: YamlClassConfiguration[] = [];
        const unparsedClasses: any[] = backendFileContent.classes;

        // check if unparsedClasses is an array
        if (unparsedClasses && !Array.isArray(unparsedClasses)) {
            throw new Error("The classes property must be an array.");
        }

        if (unparsedClasses && Array.isArray(unparsedClasses)) {
            classes = await Promise.all(
                unparsedClasses.map((c) => YamlClassConfiguration.create(c)),
            );
        }
        const backendScripts: YamlScriptsConfiguration | undefined = {
            preBackendDeploy: backendFileContent.scripts.preBackendDeploy,
            postBackendDeploy: backendFileContent.scripts.postBackendDeploy,
        };
        if (
            backendFileContent.options &&
            backendFileContent.options.nodeRuntime &&
            !supportedNodeRuntimes.includes(backendFileContent.options.nodeRuntime)
        ) {
            throw new Error(
                "The node version in the genezio.yaml configuration file is not valid. The value must be one of the following: " +
                    supportedNodeRuntimes.join(", "),
            );
        }

        return {
            options: backendFileContent.options,
            classes,
            backendScripts,
        };
    }

    static async parseFrontendYaml(workspace: any) {
        if (!fileExists(workspace.frontend)) {
            throw new Error(
                `The folder ${workspace.frontend} specified in genezio.yaml in workspace.backend does not exist.`,
            );
        }

        const frontendFileContentUTF8 = await readUTF8File(
            path.join(workspace.frontend, "genezio.yaml"),
        );
        const frontendFileContent = parse(frontendFileContentUTF8);
        const frontendScripts: YamlScriptsConfiguration = {
            preFrontendDeploy: frontendFileContent.scripts?.preFrontendDeploy,
            postFrontendDeploy: frontendFileContent.scripts?.postFrontendDeploy,
        };

        if (frontendFileContent.frontend) {
            if (!frontendFileContent.frontend.path) {
                throw new Error("The frontend.path value is not set.");
            }
        }

        return {
            frontendScripts,
            frontend: frontendFileContent.frontend,
        };
    }

    static async create(configurationFileContent: any): Promise<YamlProjectConfiguration> {
        if (!configurationFileContent.name) {
            throw new Error("The name property is missing from the configuration file.");
        }

        const nameRegex = new RegExp("^[a-zA-Z][-a-zA-Z0-9]*$");
        if (!nameRegex.test(configurationFileContent.name)) {
            throw new Error("The project name is not valid. It must be [a-zA-Z][-a-zA-Z0-9]*");
        }

        let sdk: YamlSdkConfiguration | undefined;
        let classes: YamlClassConfiguration[] = [];
        if (
            configurationFileContent.options &&
            configurationFileContent.options.nodeRuntime &&
            !supportedNodeRuntimes.includes(configurationFileContent.options.nodeRuntime)
        ) {
            throw new Error(
                "The node version in the genezio.yaml configuration file is not valid. The value must be one of the following: " +
                    supportedNodeRuntimes.join(", "),
            );
        }

        const projectLanguage = configurationFileContent.language
            ? Language[configurationFileContent.language as keyof typeof Language]
            : Language.ts;

        if (
            configurationFileContent.sdk &&
            configurationFileContent.sdk.path &&
            configurationFileContent.sdk.language
        ) {
            const language: string = configurationFileContent.sdk.language;

            if (!Language[language as keyof typeof Language]) {
                log.info(
                    "This sdk.language is not supported by default. It will be treated as a custom language.",
                );
            }

            sdk = new YamlSdkConfiguration(
                Language[configurationFileContent.sdk.language as keyof typeof Language],
                configurationFileContent.sdk.path,
            );
        }

        const unparsedClasses: any[] = configurationFileContent.classes;

        // check if unparsedClasses is an array
        if (unparsedClasses && !Array.isArray(unparsedClasses)) {
            throw new Error("The classes property must be an array.");
        }

        if (unparsedClasses && Array.isArray(unparsedClasses)) {
            classes = await Promise.all(
                unparsedClasses.map((c) => YamlClassConfiguration.create(c)),
            );
        }

        if (
            configurationFileContent.plugins?.astGenerator &&
            !Array.isArray(configurationFileContent.plugins?.astGenerator)
        ) {
            throw new Error("astGenerator must be an array");
        }
        if (
            configurationFileContent.plugins?.sdkGenerator &&
            !Array.isArray(configurationFileContent.plugins?.sdkGenerator)
        ) {
            throw new Error("sdkGenerator must be an array");
        }

        const plugins: YamlPluginsConfiguration | undefined = configurationFileContent.plugins;

        if (configurationFileContent.cloudProvider) {
            if (!cloudProviders.includes(configurationFileContent.cloudProvider)) {
                throw new Error(
                    `The cloud provider ${configurationFileContent.cloudProvider} is invalid. Please use ${CloudProviderIdentifier.GENEZIO} or ${CloudProviderIdentifier.SELF_HOSTED_AWS}.`,
                );
            }
        }

        const scripts: YamlScriptsConfiguration | undefined = configurationFileContent.scripts;

        if (configurationFileContent.region) {
            if (!regions.includes(configurationFileContent.region)) {
                throw new Error(
                    `The region is invalid. Please use a valid region.\n Region list: ${regions}`,
                );
            }
        }

        if (configurationFileContent.frontend) {
            if (!configurationFileContent.frontend.path) {
                throw new Error("The frontend.path value is not set.");
            }
        }

        let workspace;
        if (configurationFileContent.workspace) {
            if (!configurationFileContent.language) {
                throw new Error('"language" property is missing from genezio.yaml.');
            }

            if (!configurationFileContent.workspace.frontend) {
                throw new Error('"frontend" property is missing from workspace in genezio.yaml.');
            }

            if (!configurationFileContent.workspace.backend) {
                throw new Error('"backend" property is missing from workspace in genezio.yaml.');
            }
            workspace = new YamlWorkspace(
                configurationFileContent.workspace.backend,
                configurationFileContent.workspace.frontend,
            );
        }

        return new YamlProjectConfiguration(
            configurationFileContent.name,
            configurationFileContent.region || "us-east-1",
            projectLanguage,
            sdk,
            configurationFileContent.cloudProvider || CloudProviderIdentifier.GENEZIO,
            classes,
            configurationFileContent.frontend,
            scripts,
            plugins,
            configurationFileContent.options,
            workspace,
            configurationFileContent.packageManager,
        );
    }

    getMethodType(path: string, methodName: string): TriggerType | undefined {
        const classElement = this.classes?.find((classElement) => {
            return classElement.path === path;
        });

        return classElement?.getMethodType(methodName);
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
            sdk: this.sdk
                ? {
                      language: this.sdk?.language,
                      path: this.sdk?.path,
                  }
                : undefined,
            scripts: this.scripts
                ? {
                      preBackendDeploy: this.scripts?.preBackendDeploy,
                      preFrontendDeploy: this.scripts?.preFrontendDeploy,
                      postBackendDeploy: this.scripts?.postBackendDeploy,
                      postFrontendDeploy: this.scripts?.postFrontendDeploy,
                  }
                : undefined,
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
