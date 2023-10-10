import path from "path";
import yaml from "yaml";
import { getFileDetails, writeToFile } from "../utils/file.js";
import { regions } from "../utils/configs.js";
import { isValidCron } from "cron-validator";
import log from "loglevel";
import {
  CloudProviderIdentifier,
  cloudProviders,
} from "./cloudProviderIdentifier.js";
import { NodeOptions } from "./nodeRuntime.js";

export enum TriggerType {
  jsonrpc = "jsonrpc",
  cron = "cron",
  http = "http",
}

export function getTriggerTypeFromString(string: string): TriggerType {
    if (
        string &&
        !TriggerType[string as keyof typeof TriggerType]
    ) {
        const triggerTypes: string = Object.keys(TriggerType).join(", ");
        throw new Error(
            "Specified class type for " +
                    string +
                        " is incorrect. Accepted values: " +
                            triggerTypes +
                                "."
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
  kt = "kotlin"
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
    classType: TriggerType
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
      type =
        TriggerType[methodConfigurationYaml.type as keyof typeof TriggerType];
    }

    if (type == TriggerType.cron && !methodConfigurationYaml.cronString) {
      throw new Error("The cron method is missing a cron string property.");
    }

    // Check cron string format
    if (type == TriggerType.cron) {
      if (!isValidCron(methodConfigurationYaml.cronString)) {
        throw new Error(
          "The cron string is not valid. Check https://crontab.guru/ for more information."
        );
      }

      const cronParts = methodConfigurationYaml.cronString.split(" ");
      if (cronParts[2] != "*" && cronParts[4] != "*") {
        throw new Error(
          "The cron string is not valid. The day of the month and day of the week cannot be specified at the same time."
        );
      }
    }

    return new YamlMethodConfiguration(
      methodConfigurationYaml.name,
      type,
      methodConfigurationYaml.cronString
    );
  }
}

export class YamlClassConfiguration {
  path: string;
  type: TriggerType;
  language: string;
  name?: string;
  methods: YamlMethodConfiguration[];

  constructor(
    path: string,
    type: TriggerType,
    language: string,
    methods: YamlMethodConfiguration[],
    name?: string
  ) {
    this.path = path;
    this.type = type;
    this.methods = methods;
    this.language = language;
    this.name = name;
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

  static async create(
    classConfigurationYaml: any
  ): Promise<YamlClassConfiguration> {
    if (!classConfigurationYaml.path) {
      throw new Error("Path is missing from class.");
    }

    let triggerType = TriggerType.jsonrpc;

    if (classConfigurationYaml.type) {
      triggerType = getTriggerTypeFromString(classConfigurationYaml.type)
    }

    const unparsedMethods: any[] = classConfigurationYaml.methods || [];
    const methods = await Promise.all(
      unparsedMethods.map((method: any) =>
        YamlMethodConfiguration.create(method, triggerType)
      )
    );
    const language = path.parse(classConfigurationYaml.path).ext;

    return new YamlClassConfiguration(
      classConfigurationYaml.path,
      triggerType,
      language,
      methods,
      classConfigurationYaml.name
    );
  }
}

export type YamlFrontend = {
  path: string;
  subdomain: string;
};

export class YamlScriptsConfiguration {
  preBackendDeploy?: string;
  postBackendDeploy?: string;
  postFrontendDeploy?: string;
  preFrontendDeploy?: string;

  constructor(
    preBackendDeploy: string,
    postBackendDeploy: string,
    postFrontendDeploy: string,
    preFrontendDeploy: string
  ) {
    this.preBackendDeploy = preBackendDeploy;
    this.postBackendDeploy = postBackendDeploy;
    this.postFrontendDeploy = postFrontendDeploy;
    this.preFrontendDeploy = preFrontendDeploy;
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

const supportedNodeRuntimes: string[] = ["nodejs16.x", "nodejs18.x"];

/**
 * This class represents the model for the YAML configuration file.
 */
export class YamlProjectConfiguration {
  name: string;
  region: string;
  sdk?: YamlSdkConfiguration;
  cloudProvider?: CloudProviderIdentifier;
  options?: NodeOptions;
  classes: YamlClassConfiguration[];
  frontend?: YamlFrontend;
  scripts?: YamlScriptsConfiguration;
  plugins?: YamlPluginsConfiguration;

  constructor(
    name: string,
    region: string,
    sdk: YamlSdkConfiguration | undefined = undefined,
    cloudProvider: CloudProviderIdentifier,
    classes: YamlClassConfiguration[],
    frontend: YamlFrontend | undefined = undefined,
    scripts: YamlScriptsConfiguration | undefined = undefined,
    plugins: YamlPluginsConfiguration | undefined = undefined,
    options: NodeOptions | undefined = undefined
  ) {
    this.name = name;
    this.region = region;
    this.sdk = sdk;
    this.cloudProvider = cloudProvider;
    this.classes = classes;
    this.frontend = frontend;
    this.scripts = scripts;
    this.plugins = plugins;
    this.options = options;
  }

  getClassConfiguration(path: string): YamlClassConfiguration {
    const classConfiguration = this.classes?.find(
      (classConfiguration) => classConfiguration.path === path
    );

    if (!classConfiguration) {
      throw new Error("Class configuration not found for path " + path);
    }

    return classConfiguration;
  }

  static async create(
    configurationFileContent: any
  ): Promise<YamlProjectConfiguration> {
    if (!configurationFileContent.name) {
      throw new Error(
        "The name property is missing from the configuration file."
      );
    }

    const nameRegex = new RegExp("^[a-zA-Z][-a-zA-Z0-9]*$");
    if (!nameRegex.test(configurationFileContent.name)) {
      throw new Error(
        "The project name is not valid. It must be [a-zA-Z][-a-zA-Z0-9]*"
      );
    }

    let sdk: YamlSdkConfiguration | undefined;
    let classes: YamlClassConfiguration[] = [];
    if (
      configurationFileContent.options &&
      configurationFileContent.options.nodeRuntime &&
      !supportedNodeRuntimes.includes(
        configurationFileContent.options.nodeRuntime
      )
    ) {
      throw new Error(
        "The node version in the genezio.yaml configuration file is not valid. The value must be one of the following: " +
          supportedNodeRuntimes.join(", ")
      );
    }

    if (
      configurationFileContent.sdk &&
      configurationFileContent.sdk.path &&
      configurationFileContent.sdk.language
    ) {
      const language: string = configurationFileContent.sdk.language;

      if (!Language[language as keyof typeof Language]) {
        log.info(
          "This sdk.language is not supported by default. It will be treated as a custom language."
        );
      }

      sdk = new YamlSdkConfiguration(
        Language[
          configurationFileContent.sdk.language as keyof typeof Language
        ],
        configurationFileContent.sdk.path
      );
    }

    const unparsedClasses: any[] = configurationFileContent.classes;

    // check if unparsedClasses is an array
    if (unparsedClasses && !Array.isArray(unparsedClasses)) {
      throw new Error("The classes property must be an array.");
    }

    if (unparsedClasses && Array.isArray(unparsedClasses)) {
      classes = await Promise.all(
        unparsedClasses.map((c) => YamlClassConfiguration.create(c))
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

    const plugins: YamlPluginsConfiguration | undefined =
      configurationFileContent.plugins;

    if (configurationFileContent.cloudProvider) {
      if (!cloudProviders.includes(configurationFileContent.cloudProvider)) {
        throw new Error(
          `The cloud provider ${configurationFileContent.cloudProvider} is invalid. Please use ${CloudProviderIdentifier.GENEZIO} or ${CloudProviderIdentifier.SELF_HOSTED_AWS}.`
        );
      }
    }

    const scripts: YamlScriptsConfiguration | undefined =
      configurationFileContent.scripts;

    if (configurationFileContent.region) {
      if (!regions.includes(configurationFileContent.region)) {
        throw new Error(
          `The region is invalid. Please use a valid region.\n Region list: ${regions}`
        );
      }
    }

    if (configurationFileContent.frontend) {
      if (!configurationFileContent.frontend.path) {
        throw new Error("The frontend.path value is not set.");
      }
    }

    return new YamlProjectConfiguration(
      configurationFileContent.name,
      configurationFileContent.region || "us-east-1",
      sdk,
      configurationFileContent.cloudProvider || CloudProviderIdentifier.GENEZIO,
      classes,
      configurationFileContent.frontend,
      scripts,
      plugins,
      configurationFileContent.options
    );
  }

  getMethodType(path: string, methodName: string): TriggerType | undefined {
    const classElement = this.classes?.find((classElement) => {
      return classElement.path === path;
    });

    return classElement?.getMethodType(methodName);
  }

  addClass(
    classPath: string,
    type: TriggerType,
    methods: YamlMethodConfiguration[]
  ) {
    const language = path.parse(classPath).ext;
    this.classes?.push(
      new YamlClassConfiguration(classPath, type, language, methods)
    );
  }

  async writeToFile(path = "./genezio.yaml") {
    const content = {
      name: this.name,
      region: this.region,
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
      classes: this.classes.length
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
    };

    const fileDetails = getFileDetails(path);
    const yamlString = yaml.stringify(content);

    await writeToFile(fileDetails.path, fileDetails.filename, yamlString).catch(
      (error) => {
        console.error(error.toString());
      }
    );
  }

  async addSubdomain(subdomain: string) {
    this.frontend = {
      path: this.frontend?.path || "./frontend/build",
      subdomain: subdomain,
    };
    await this.writeToFile();
  }
}

export class YamlLocalConfiguration {
  generateSdk: boolean;
  path?: string | undefined;
  language?: Language | undefined;

  constructor(
    generateSdk: boolean,
    path: string | undefined = undefined,
    language: Language | undefined = undefined
  ) {
    this.generateSdk = generateSdk;
    this.path = path;
    this.language = language;
  }

  static async create(
    yamlLocalConfiguration: any
  ): Promise<YamlLocalConfiguration | undefined> {
    if (yamlLocalConfiguration.generateSdk === undefined) {
      return undefined;
    }
    const generateSdk: boolean = yamlLocalConfiguration.generateSdk;
    const path: string | undefined = yamlLocalConfiguration.path;
    const language: Language | undefined = yamlLocalConfiguration.language;

    return new YamlLocalConfiguration(generateSdk, path, language);
  }

  async writeToFile(path = "./genezio.local.yaml") {
    const content = {
      generateSdk: this.generateSdk,
      path: this.path,
      language: this.language,
    };

    const fileDetails = getFileDetails(path);
    const yamlString = yaml.stringify(content);

    await writeToFile(fileDetails.path, fileDetails.filename, yamlString).catch(
      (error) => {
        console.error(error.toString());
      }
    );
  }
}
