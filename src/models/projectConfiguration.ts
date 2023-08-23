import { getAstSummary } from "../generateSdk/utils/getAstSummary.js";
import { AstSummary } from "./astSummary.js";
import { CloudProviderIdentifier } from "./cloudProviderIdentifier.js";
import { NodeOptions } from "./nodeRuntime.js";
import { SdkGeneratorResponse } from "./sdkGeneratorResponse.js";
import { Language, TriggerType, YamlProjectConfiguration } from "./yamlProjectConfiguration.js";

export class ParameterType {
    name: string;
    type: any;
    optional: boolean;

    constructor(name: string, type: any, optional = false) {
        this.name = name
        this.type = type
        this.optional = optional
    }
}

export class MethodConfiguration {
    name: string;
    parameters: ParameterType[]
    cronString?: string;
    type: TriggerType;
    returnType: any;

    constructor(name: string, parameters: string[], returnType: any, type?: TriggerType, cronString?: string) {
        this.name = name;
        this.parameters = parameters.map((parameter) => new ParameterType(parameter, "any"));
        this.type = type ?? TriggerType.jsonrpc;
        this.cronString = cronString;
        this.returnType = returnType;
    }
}

export class ClassConfiguration {
    name: string;
    path: string;
    type: TriggerType;
    language: string;
    methods: MethodConfiguration[];
    types: any[];

    constructor(
        name: string,
        path: string,
        type: TriggerType,
        language: string,
        methods: MethodConfiguration[],
        types: any[]
    ) {
        this.name = name;
        this.path = path;
        this.type = type;
        this.methods = methods;
        this.language = language;
        this.types = types;
    }
}

export class SdkConfiguration {
    language: Language;
    path: string;

    constructor(language: Language, path: string) {
        this.language = language;
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
    options?: NodeOptions;
    cloudProvider: CloudProviderIdentifier;
    astSummary: AstSummary;
    classes: ClassConfiguration[];

    constructor(
        yamlConfiguration: YamlProjectConfiguration,
        sdkGeneratorResponse: SdkGeneratorResponse,
    ) {
        this.name = yamlConfiguration.name;
        this.region = yamlConfiguration.region;
        this.sdk = yamlConfiguration.sdk;
        this.options = yamlConfiguration.options;
        this.cloudProvider = yamlConfiguration.cloudProvider || CloudProviderIdentifier.GENEZIO;

        // Generate AST Summary
        this.astSummary = {
            version: "1.0.0",
            classes: getAstSummary(sdkGeneratorResponse.sdkGeneratorInput.classesInfo)
        };

        this.classes = this.astSummary.classes.map((c) => {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const yamlClass = yamlConfiguration.classes.find((yamlC) => yamlC.path === c.path)!;
            const methods = c?.methods.map((m) => {
                const yamlMethod = yamlClass.methods.find((yamlM) => yamlM.name === m.name)

                return {
                    name: m.name,
                    parameters: m.params.map((p) => new ParameterType(p.name, p.type, p.optional)),
                    cronString: yamlMethod?.cronString,
                    language: c.language,
                    type: yamlClass?.getMethodType(m.name),
                    returnType: m.returnType
                }
            })

            return {
                name: c.name,
                path: c.path,
                type: yamlClass?.type ?? TriggerType.jsonrpc,
                language: yamlClass.language,
                methods: methods,
                types: c.types
            }
        });
    }
}
