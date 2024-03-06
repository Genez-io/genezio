import { getAstSummary } from "../generateSdk/utils/getAstSummary.js";
import { AstSummary } from "./astSummary.js";
import { CloudProviderIdentifier } from "./cloudProviderIdentifier.js";
import { DEFAULT_NODE_RUNTIME, NodeOptions } from "./nodeRuntime.js";
import { SdkGeneratorResponse } from "./sdkGeneratorResponse.js";
import { TriggerType } from "../yamlProjectConfiguration/models.js";
import { YamlProjectConfiguration } from "../yamlProjectConfiguration/v2.js";
import path from "path";
export class ParameterType {
    name: string;
    type: any;
    optional: boolean;

    constructor(name: string, type: any, optional = false) {
        this.name = name;
        this.type = type;
        this.optional = optional;
    }
}

export class MethodConfiguration {
    name: string;
    parameters: ParameterType[];
    cronString?: string;
    type: TriggerType;
    docString?: string;
    returnType: any;

    constructor(
        name: string,
        parameters: string[],
        returnType: any,
        type?: TriggerType,
        docString?: string,
        cronString?: string,
    ) {
        this.name = name;
        this.parameters = parameters.map((parameter) => new ParameterType(parameter, "any"));
        this.type = type ?? TriggerType.jsonrpc;
        this.cronString = cronString;
        this.returnType = returnType;
        this.docString = docString;
    }
}

export class ClassConfiguration {
    name: string;
    path: string;
    type: TriggerType;
    language: string;
    methods: MethodConfiguration[];
    types: any[];
    version: string;
    docString?: string;

    constructor(
        name: string,
        path: string,
        type: TriggerType,
        language: string,
        methods: MethodConfiguration[],
        types: any[],
        version: string,
        docString?: string,
    ) {
        this.name = name;
        this.path = path;
        this.type = type;
        this.methods = methods;
        this.language = language;
        this.types = types;
        this.version = version;
        this.docString = docString;
    }
}

export class SdkConfiguration {
    language: string;
    path?: string;

    constructor(language: string, path: string | undefined) {
        this.language = language;
        this.path = path;
    }
}

export class Workspace {
    constructor(public backend: string) {}
}

/**
 * This class represents the complete image of the project.
 *
 * It combines information from the YAML configuration with the information from the AST Summary.
 */
export class ProjectConfiguration {
    name: string;
    region: string;
    options?: NodeOptions;
    cloudProvider: CloudProviderIdentifier;
    astSummary: AstSummary;
    classes: ClassConfiguration[];
    workspace?: Workspace;

    constructor(
        yamlConfiguration: YamlProjectConfiguration,
        sdkGeneratorResponse: SdkGeneratorResponse,
    ) {
        this.name = yamlConfiguration.name;
        this.region = yamlConfiguration.region;
        this.options = {
            nodeRuntime: yamlConfiguration.backend?.language.runtime || DEFAULT_NODE_RUNTIME,
        };
        this.cloudProvider =
            yamlConfiguration.backend?.cloudProvider || CloudProviderIdentifier.GENEZIO;
        this.workspace = new Workspace(yamlConfiguration.backend?.path || process.cwd());
        // Generate AST Summary
        this.astSummary = {
            version: "2",
            classes: getAstSummary(sdkGeneratorResponse.sdkGeneratorInput.classesInfo),
        };

        this.classes = this.astSummary.classes.map((c) => {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const yamlClass = yamlConfiguration.backend?.classes?.find(
                (yamlC) => path.join(yamlConfiguration.backend?.path || ".", yamlC.path) === c.path,
            );
            if (!yamlClass) {
                throw new Error(
                    `[Project Configuration] Class configuration not found for ${c.path}`,
                );
            }

            const methods = c?.methods.map((m) => {
                const yamlMethod = yamlClass.methods?.find((yamlM) => yamlM.name === m.name);

                const cronString =
                    yamlMethod !== undefined &&
                    (yamlMethod?.type === TriggerType.cron ||
                        (yamlMethod?.type === undefined && yamlClass.type === TriggerType.cron))
                        ? yamlMethod!.cronString
                        : undefined;

                return {
                    name: m.name,
                    parameters: m.params.map((p) => new ParameterType(p.name, p.type, p.optional)),
                    cronString: cronString,
                    language: c.language,
                    type: yamlMethod?.type || yamlClass.type || TriggerType.jsonrpc,
                    returnType: m.returnType,
                    docString: m.docString,
                };
            });

            return {
                name: c.name,
                path: c.path,
                type: yamlClass?.type ?? TriggerType.jsonrpc,
                language: yamlConfiguration.backend?.language.name || "ts",
                methods: methods,
                types: c.types,
                version: this.astSummary.version,
                docString: c.docString,
            };
        });
    }
}
