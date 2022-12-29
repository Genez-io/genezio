import path from "path";
import yaml from "yaml";
import { regions } from "../utils/configs";
import { getFileDetails, writeToFile } from "../utils/file";

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
  ts = "ts"
}

export class SdkConfiguration {
  language: Language;
  runtime: JsRuntime;
  path: string;

  constructor(language: Language, runtime: JsRuntime, path: string) {
    this.language = language;
    this.runtime = runtime;
    this.path = path;
  }
}

export type ParsedCronFields = {
  minutes: string;
  hours: string;
  dayOfMonth: string;
  month: string;
  dayOfWeek: string;
  year: string;
}

export class MethodConfiguration {
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
  ): Promise<MethodConfiguration> {
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

    // Check AWS 6 field format cron string
    if (type == TriggerType.cron && !MethodConfiguration.isCronStringValid(methodConfigurationYaml.cronString)) {
      throw new Error("The cron string is not valid. Check AWS documentation for more details at this link https://docs.aws.amazon.com/AmazonCloudWatch/latest/events/ScheduledEvents.html#CronExpressions")
    }

    return new MethodConfiguration(
      methodConfigurationYaml.name,
      type,
      methodConfigurationYaml.cronString
    );
  }

  static isCronStringValid(unparsedCronString : string): boolean {
    const cronFields = unparsedCronString.split(' ');

    if (cronFields.length != 6) {
      throw new Error("Cron expression have six required fields with white space separator.")
    }

    const parsedCron : ParsedCronFields = {
      minutes: cronFields[0],
      hours: cronFields[1],
      dayOfMonth: cronFields[2],
      month: cronFields[3],
      dayOfWeek: cronFields[4],
      year: cronFields[5],
    }

    // See https://docs.aws.amazon.com/AmazonCloudWatch/latest/events/ScheduledEvents.html#CronExpressions
    const regexMinutes = new RegExp('([0-59])|(,)|(-)|(\\*)|(/)');
    const regexHours = new RegExp('([0-23])|(,)|(-)|(\\*)|(/)');
    const regexDayOfMonth = new RegExp('([1-31])|(,)|(-)|(\\*)|(/)|(\\?)|(L)|(W)');
    const regexMonth = new RegExp('([1-12])|(,)|(-)|(\\*)|(/)|(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)');
    const regexDayOfWeek = new RegExp('([1-7])|(,)|(-)|(\\*)|(/)|(\\?)|(L)|(#)|(SUN|MON|TUE|WED|THU|FRI|SAT)');
    const regexYear = new RegExp('([1970-2199])|(,)|(-)|(\\*)|(/)');

    if (!regexMinutes.test(parsedCron.minutes)) {
      throw new Error("Cron field for `minutes` does not have a valid syntax.")
    }

    if (!regexHours.test(parsedCron.hours)) {
      throw new Error("Cron field for `hours` does not have a valid syntax.")
    }

    if (!regexDayOfMonth.test(parsedCron.dayOfMonth)) {
      throw new Error("Cron field for `dayOfMonth` does not have a valid syntax.")
    }

    if (!regexMonth.test(parsedCron.month)) {
      throw new Error("Cron field for `month` does not have a valid syntax.")
    }

    if (!regexDayOfWeek.test(parsedCron.dayOfWeek)) {
      throw new Error("Cron field for `dayOfWeek` does not have a valid syntax.")
    }

    if (!regexYear.test(parsedCron.year)) {
      throw new Error("Cron field for `year` does not have a valid syntax.")
    }

    return true
  }
}

export class ClassConfiguration {
  path: string;
  type: TriggerType;
  language: string;
  methods: MethodConfiguration[];

  constructor(
    path: string,
    type: TriggerType,
    language: string,
    methods: MethodConfiguration[]
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
  ): Promise<ClassConfiguration> {
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
        MethodConfiguration.create(method, triggerType)
      )
    );
    const language = path.parse(classConfigurationYaml.path).ext;

    return new ClassConfiguration(
      classConfigurationYaml.path,
      triggerType,
      language,
      methods
    );
  }
}

export class ProjectConfiguration {
  name: string;
  region: string;
  sdk: SdkConfiguration;
  classes: ClassConfiguration[];

  constructor(
    name: string,
    region: string,
    sdk: SdkConfiguration,
    classes: ClassConfiguration[]
  ) {
    this.name = name;
    this.region = region;
    this.sdk = sdk;
    this.classes = classes;
  }

  static async create(
    configurationFileContent: any
  ): Promise<ProjectConfiguration> {
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
      !JsRuntime[configurationFileContent.sdk.runtime as keyof typeof JsRuntime]
    ) {
      throw new Error("The sdk.runtime property is invalid.");
    }

    const sdk = new SdkConfiguration(
      Language[configurationFileContent.sdk.language as keyof typeof Language],
      JsRuntime[configurationFileContent.sdk.runtime as keyof typeof JsRuntime],
      configurationFileContent.sdk.path
    );

    const unparsedClasses: any[] = configurationFileContent.classes;

    if (!unparsedClasses) {
      throw new Error(
        "The configuration file should contain at least one class."
      );
    }

    const classes = await Promise.all(
      unparsedClasses.map((c) => ClassConfiguration.create(c))
    );

    if (configurationFileContent.region) {
      if (!regions.includes(configurationFileContent.region)) {
        throw new Error(
          `The region is invalid. Please use a valid region.\n Region list: ${regions}`
        );
      }
    }

    return new ProjectConfiguration(
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
    methods: MethodConfiguration[]
  ) {
    const language = path.parse(classPath).ext;
    this.classes.push(
      new ClassConfiguration(classPath, type, language, methods)
    );
  }

  async writeToFile(path = "./genezio.yaml") {
    const classes = [];
    const content = {
      name: this.name,
      sdk: {
        language: this.sdk.language,
        runtime: this.sdk.runtime,
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
