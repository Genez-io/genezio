import path from "path";
import yaml from "yaml";
import { getFileDetails, writeToFile } from "../utils/file";
import { regions } from "../utils/configs";
import { isValidCron } from 'cron-validator'
import log from "loglevel";

export enum TriggerType {
  jsonrpc = "jsonrpc",
  cron = "cron",
  http = "http"
}

export enum JsRuntime {
  browser = "browser",
  node = "node"
}

export enum Language {
  js = "js",
  ts = "ts",
  swift = "swift",
  python = "python",
  dart = "dart"
}

export type JsSdkOptions = {
  runtime: "node" | "browser";
};

export class YamlSdkConfiguration {
  language: Language;
  options: JsSdkOptions | any;
  path: string;

  constructor(language: Language, runtime: JsRuntime | null, path: string) {
    this.language = language;
    this.options = {};
    this.options.runtime = runtime || null;
    this.path = path;
  }
}

export type ParsedCronFields = {
  minutes: string;
  hours: string;
  dayOfMonth: string;
  month: string;
  dayOfWeek: string;
}

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

    // Checkcron string format


    if (type == TriggerType.cron) {
      if (!isValidCron(methodConfigurationYaml.cronString)) {
        throw new Error("The cron string is not valid. Check https://crontab.guru/ for more information.");
      }

      const cronParts = methodConfigurationYaml.cronString.split(" ");
      if (cronParts[2] != "*" && cronParts[4] != "*") {
        throw new Error("The cron string is not valid. The day of the month and day of the week cannot be specified at the same time.");
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
  methods: YamlMethodConfiguration[];

  constructor(
    path: string,
    type: TriggerType,
    language: string,
    methods: YamlMethodConfiguration[]
  ) {
    this.path = path;
    this.type = type;
    this.methods = methods;
    this.language = language;
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

    if (
      classConfigurationYaml.type &&
      !TriggerType[classConfigurationYaml.type as keyof typeof TriggerType]
    ) {
      const triggerTypes: string = Object.keys(TriggerType).join(", ");
      throw new Error("Specified class type for " + classConfigurationYaml.path + " is incorrect. Accepted values: " + triggerTypes + ".");
    }

    let triggerType = TriggerType.jsonrpc;

    if (classConfigurationYaml.type) {
      triggerType =
        TriggerType[classConfigurationYaml.type as keyof typeof TriggerType];
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
      methods
    );
  }
}

export type YamlFrontend = {
  path: string,
  subdomain: string,
}

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


/**
 * This class represents the model for the YAML configuration file.
 */
export class YamlProjectConfiguration {
  name: string;
  region: string;
  sdk: YamlSdkConfiguration;
  cloudProvider?: string;
  classes: YamlClassConfiguration[];
  frontend?: YamlFrontend;
  scripts?: YamlScriptsConfiguration;
  plugins?: YamlPluginsConfiguration;

  constructor(
    name: string,
    region: string,
    sdk: YamlSdkConfiguration,
    cloudProvider: string,
    classes: YamlClassConfiguration[],
    frontend: YamlFrontend|undefined = undefined,
    scripts: YamlScriptsConfiguration | undefined = undefined,
    plugins: YamlPluginsConfiguration | undefined = undefined
  ) {
    this.name = name;
    this.region = region;
    this.sdk = sdk;
    this.cloudProvider = cloudProvider;
    this.classes = classes;
    this.frontend = frontend;
    this.scripts = scripts;
    this.plugins = plugins;
  }

  getClassConfiguration(path: string): YamlClassConfiguration {
    const classConfiguration = this.classes.find(
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
      throw new Error("The method name is not valid. It must be [a-zA-Z][-a-zA-Z0-9]*");
    }

    if (!configurationFileContent.sdk) {
      throw new Error("The sdk property is missing from the configuration file.");
    }

    if (!configurationFileContent.sdk.path) {
      throw new Error(
        "The sdk.path property is missing from the configuration file."
      );
    }

    const language: string = configurationFileContent.sdk.language;

    if (!language) {
      throw new Error("The sdk.language property is missing.");
    }

    if (!Language[language as keyof typeof Language]) {
      log.info("This sdk.language is not supported by default. It will be treated as a custom language.");
    }

    if (Language[language as keyof typeof Language] == Language.js ||
        Language[language as keyof typeof Language] == Language.ts) {
      if (!configurationFileContent.sdk.options) {
        throw new Error("The sdk.options property is missing from the configuration file.");
      }

      if (!configurationFileContent.sdk.options.runtime) {
        throw new Error("The sdk.options.runtime property is missing from the configuration file.");
      }

      if (!JsRuntime[configurationFileContent.sdk.options.runtime as keyof typeof JsRuntime]) {
        throw new Error("The sdk.options.runtime property is invalid.");
      }
    }

    const jsRuntime: JsRuntime | null = configurationFileContent.sdk.options
      ? JsRuntime[
          configurationFileContent.sdk.options
            .runtime as keyof typeof JsRuntime
        ]
      : null;

    const sdk = new YamlSdkConfiguration(
      Language[
        configurationFileContent.sdk.language as keyof typeof Language
      ],
      jsRuntime,
      configurationFileContent.sdk.path
    );

    const unparsedClasses: any[] = configurationFileContent.classes;

    if (!unparsedClasses) {
      throw new Error(
        "The configuration file should contain at least one class."
      );
    }

    const classes = await Promise.all(
      unparsedClasses.map((c) => YamlClassConfiguration.create(c))
    );

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

    const scripts: YamlScriptsConfiguration | undefined = configurationFileContent.scripts;
    if (configurationFileContent.plugins?.astGenerator && !Array.isArray(configurationFileContent.plugins?.astGenerator)) {
      throw new Error("astGenerator must be an array");
    }
    if (configurationFileContent.plugins?.sdkGenerator && !Array.isArray(configurationFileContent.plugins?.sdkGenerator)) {
      throw new Error("sdkGenerator must be an array");
    }
    const plugins: YamlPluginsConfiguration | undefined = configurationFileContent.plugins;

    return new YamlProjectConfiguration(
      configurationFileContent.name,
      configurationFileContent.region || "us-east-1",
      sdk,
      configurationFileContent.cloudProvider || "aws",
      classes,
      configurationFileContent.frontend,
      scripts,
      plugins
    );
  }

  getMethodType(path: string, methodName: string): TriggerType | undefined {
    const classElement = this.classes.find((classElement) => {
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
    this.classes.push(
      new YamlClassConfiguration(classPath, type, language, methods)
    );
  }

  async writeToFile(path = "./genezio.yaml") {
    const classes = [];
    const content = {
      name: this.name,
      region: this.region,
      cloudProvider: this.cloudProvider ? this.cloudProvider : undefined,
      sdk: {
        language: this.sdk.language,
        options: {
          runtime: this.sdk.options?.runtime
        },
        path: this.sdk.path
      },
      scripts: this.scripts ? {
        preBackendDeploy: this.scripts?.preBackendDeploy,
        postBackendDeploy: this.scripts?.postBackendDeploy,
        postFrontendDeploy: this.scripts?.postFrontendDeploy
      } : undefined,
      frontend: this.frontend ? {
        path: this.frontend?.path,
        subdomain: this.frontend?.subdomain
      } : undefined,
      classes: this.classes.map((c) => ({
        path: c.path,
        type: c.type,
        methods: c.methods.map((m) => ({
          name: m.name,
          type: m.type,
          cronString: m.cronString
        }))
      }))
    };

    this.classes.forEach((c) => {
      classes.push();
    });

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
      subdomain: subdomain
    };
    await this.writeToFile();
  }
}
