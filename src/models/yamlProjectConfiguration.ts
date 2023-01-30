import path from "path";
import yaml from "yaml";
import { getFileDetails, writeToFile } from "../utils/file";
import { regions } from "../utils/configs";
import { isValidCron } from 'cron-validator'

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
  swift = "swift"
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
      throw new Error("The type is incorrect.");
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

/**
 * This class represents the model for the YAML configuration file.
 */
export class YamlProjectConfiguration {
  name: string;
  region: string;
  sdk: YamlSdkConfiguration;
  classes: YamlClassConfiguration[];

  constructor(
    name: string,
    region: string,
    sdk: YamlSdkConfiguration,
    classes: YamlClassConfiguration[]
  ) {
    this.name = name;
    this.region = region;
    this.sdk = sdk;
    this.classes = classes;
  }

  static async create(
    configurationFileContent: any
  ): Promise<YamlProjectConfiguration> {
    if (!configurationFileContent.name) {
      throw new Error(
        "The name property is missing from the configuration file."
      );
    }

    if (!configurationFileContent.sdk.path) {
      throw new Error(
        "The sdk.path property is missing from the configuration file."
      );
    }

    const language: string = configurationFileContent.sdk.language;

    if (!language || !Language[language as keyof typeof Language]) {
      throw new Error("The sdk.language property is invalid.");
    }

    if (
      (Language[
        configurationFileContent.sdk.language as keyof typeof Language
      ] == Language.js ||
        Language[
          configurationFileContent.sdk.language as keyof typeof Language
        ] == Language.ts) &&
      configurationFileContent.sdk.options &&
      !JsRuntime[
        configurationFileContent.sdk.options
          .runtime as keyof typeof JsRuntime
      ]
    ) {
      throw new Error("The sdk.options.runtime property is invalid.");
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

    return new YamlProjectConfiguration(
      configurationFileContent.name,
      configurationFileContent.region || "us-east-1",
      sdk,
      classes
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
      sdk: {
        language: this.sdk.language,
        options: {
          runtime: this.sdk.options?.runtime
        },
        path: this.sdk.path
      },
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
}
