import { AstSummary } from "./SdkGeneratorResponse";
import { JsRuntime, JsSdkOptions, Language, TriggerType, YamlProjectConfiguration } from "./yamlProjectConfiguration";

export class ParameterType {
    name: string;
    type: string;

    constructor(name: string, type: string) {
        this.name = name
        this.type = type
    }
}

export class MethodConfiguration {
    name: string;
    parameters: ParameterType[]
    cronString?: string;
    type: TriggerType;

    constructor(name: string, parameters: string[], type?: TriggerType, cronString?: string) {
        this.name = name;
        this.parameters = parameters.map((parameter) => new ParameterType(parameter, "any"));
        this.type = type ?? TriggerType.jsonrpc;
        this.cronString = cronString;
    }
}

export class ClassConfiguration {
    name: string;
    path: string;
    type: TriggerType;
    language: string;
    methods: MethodConfiguration[];

    constructor(
        name: string,
        path: string,
        type: TriggerType,
        language: string,
        methods: MethodConfiguration[]
    ) {
        this.name = name;
        this.path = path;
        this.type = type;
        this.methods = methods;
        this.language = language;
    }
}

export class SdkConfiguration {
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

/**
 * This class represents the complete image of the project.
 * 
 * It combines information from the YAML configuration with the information from the AST Summary.
 */
export class ProjectConfiguration {
    name: string;
    region: string;
    sdk: SdkConfiguration;
    cloudProvider?: string;
    classes: ClassConfiguration[];

    constructor(
        yamlConfiguration: YamlProjectConfiguration,
        astSummary: AstSummary,
    ) {
        this.name = yamlConfiguration.name;
        this.region = yamlConfiguration.region;
        this.sdk = yamlConfiguration.sdk;
        this.cloudProvider = yamlConfiguration.cloudProvider || "aws";

        this.classes = astSummary.classes.map((c) => {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const yamlClass = yamlConfiguration.classes.find((yamlC) => yamlC.path === c.path)!;
            const methods = c?.methods.map((m) => {
                const yamlMethod = yamlClass.methods.find((yamlM) => yamlM.name === m.name)

                return {
                    name: m.name,
                    parameters: m.params.map((p) => new ParameterType(p.name, p.type)),
                    cronString: yamlMethod?.cronString,
                    type: yamlClass?.getMethodType(m.name)
                }
            })

            return {
                name: c.name,
                path: c.path,
                type: yamlClass?.type ?? TriggerType.jsonrpc,
                language: yamlClass.language,
                methods: methods,
            }
        });
    }
}