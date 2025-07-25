/* eslint-disable @typescript-eslint/no-explicit-any */
import { getAstSummary } from "../generateSdk/utils/getAstSummary.js";
import { AstSummary } from "./astSummary.js";
import { CloudProviderIdentifier } from "./cloudProviderIdentifier.js";
import { NodeOptions, PythonOptions } from "./projectOptions.js";
import { SdkHandlerResponse } from "./sdkGeneratorResponse.js";
import {
    DatabaseType,
    FunctionType,
    InstanceSize,
    Language,
    TriggerType,
} from "../projectConfiguration/yaml/models.js";
import { YamlProjectConfiguration } from "../projectConfiguration/yaml/v2.js";
import path from "path";
import { UserError } from "../errors.js";

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
    auth?: boolean;
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
    options?: { [key: string]: string };
    timeout?: number;
    storageSize?: number;
    instanceSize?: InstanceSize;
    vcpuCount?: number;
    memoryMb?: number;
    maxConcurrentRequestsPerInstance?: number;
    maxConcurrentInstances?: number;
    cooldownTime?: number;
    persistent?: boolean;

    constructor(
        name: string,
        path: string,
        type: TriggerType,
        language: string,
        methods: MethodConfiguration[],
        types: any[],
        version: string,
        docString?: string,
        timeout?: number,
        storageSize?: number,
        instanceSize?: InstanceSize,
        vcpuCount?: number,
        memoryMb?: number,
        maxConcurrentRequestsPerInstance?: number,
        maxConcurrentInstances?: number,
        cooldownTime?: number,
        persistent?: boolean,
    ) {
        this.name = name;
        this.path = path;
        this.type = type;
        this.methods = methods;
        this.language = language;
        this.types = types;
        this.version = version;
        this.docString = docString;
        this.timeout = timeout;
        this.storageSize = storageSize;
        this.instanceSize = instanceSize;
        this.vcpuCount = vcpuCount;
        this.memoryMb = memoryMb;
        this.maxConcurrentRequestsPerInstance = maxConcurrentRequestsPerInstance;
        this.maxConcurrentInstances = maxConcurrentInstances;
        this.cooldownTime = cooldownTime;
        this.persistent = persistent;
    }
}

export class FunctionConfiguration {
    name: string;
    path: string;
    handler: string;
    language: string;
    entry: string;
    type: FunctionType;
    timeout?: number;
    storageSize?: number;
    instanceSize?: InstanceSize;
    vcpuCount?: number;
    memoryMb?: number;
    maxConcurrentRequestsPerInstance?: number;
    maxConcurrentInstances?: number;
    cooldownTime?: number;
    persistent?: boolean;
    healthcheckPath?: string;

    constructor(
        name: string,
        path: string,
        handler: string,
        language: string,
        entry: string,
        type: FunctionType,
        timeout?: number,
        storageSize?: number,
        instanceSize?: InstanceSize,
        vcpuCount?: number,
        memoryMb?: number,
        maxConcurrentRequestsPerInstance?: number,
        maxConcurrentInstances?: number,
        cooldownTime?: number,
        persistent?: boolean,
        healthcheckPath?: string,
    ) {
        this.name = name;
        this.path = path;
        this.handler = handler;
        this.language = language;
        this.entry = entry;
        this.type = type;
        this.timeout = timeout;
        this.storageSize = storageSize;
        this.instanceSize = instanceSize;
        this.vcpuCount = vcpuCount;
        this.memoryMb = memoryMb;
        this.maxConcurrentRequestsPerInstance = maxConcurrentRequestsPerInstance;
        this.maxConcurrentInstances = maxConcurrentInstances;
        this.cooldownTime = cooldownTime;
        this.persistent = persistent;
        this.healthcheckPath = healthcheckPath;
    }
}

export class DatabaseConfiguration {
    name: string;
    region?: string;
    type?: DatabaseType;

    constructor(name: string, region?: string, type?: DatabaseType) {
        this.name = name;
        this.region = region;
        this.type = type;
    }
}

export class AuthenticationConfiguration {
    database: NativeAuthDatabaseConfiguration | YourOwnAuthDatabaseConfiguration;

    constructor(database: NativeAuthDatabaseConfiguration | YourOwnAuthDatabaseConfiguration) {
        this.database = database;
    }
}

export class NativeAuthDatabaseConfiguration {
    name: string;

    constructor(name: string) {
        this.name = name;
    }
}

export class YourOwnAuthDatabaseConfiguration {
    type: string;
    uri: string;

    constructor(type: string, uri: string) {
        this.type = type;
        this.uri = uri;
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
    options?: NodeOptions | PythonOptions;
    cloudProvider: CloudProviderIdentifier;
    astSummary: AstSummary;
    classes: ClassConfiguration[];
    functions: FunctionConfiguration[];
    workspace?: Workspace;

    constructor(
        yamlConfiguration: YamlProjectConfiguration,
        cloudProvider: CloudProviderIdentifier,
        sdkHandlerResponse: SdkHandlerResponse,
    ) {
        this.name = yamlConfiguration.name;
        this.region = yamlConfiguration.region;
        switch (yamlConfiguration.backend?.language.name) {
            case Language.ts:
            case Language.js:
                this.options = {
                    nodeRuntime: yamlConfiguration.backend.language.runtime,
                    architecture: yamlConfiguration.backend.language.architecture,
                } as NodeOptions;
                break;
            case Language.python:
            case Language.pythonAsgi:
                this.options = {
                    pythonRuntime: yamlConfiguration.backend.language.runtime,
                    architecture: yamlConfiguration.backend.language.architecture,
                } as PythonOptions;
                break;
        }
        this.cloudProvider = cloudProvider || CloudProviderIdentifier.GENEZIO_CLOUD;
        this.workspace = new Workspace(yamlConfiguration.backend?.path || process.cwd());
        // Generate AST Summary
        this.astSummary = {
            version: "2",
            classes: getAstSummary(sdkHandlerResponse.classesInfo),
        };

        this.classes = this.astSummary.classes.map((c) => {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const yamlClass = yamlConfiguration.backend?.classes?.find(
                (yamlC) => path.join(yamlConfiguration.backend?.path || ".", yamlC.path) === c.path,
            );
            if (!yamlClass) {
                throw new UserError(
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
                    auth: yamlMethod?.auth,
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
                timeout: c.timeout,
                storageSize: c.storageSize,
                instanceSize: c.instanceSize,
                vcpuCount: c.vcpuCount,
                memoryMb: c.memoryMb,
                maxConcurrentRequestsPerInstance: c.maxConcurrentRequestsPerInstance,
                maxConcurrentInstances: c.maxConcurrentInstances,
                cooldownTime: c.cooldownTime,
                persistent: c.persistent,
            };
        });

        this.functions =
            yamlConfiguration.backend?.functions?.map((f) => {
                return {
                    name: `function-${f.name}`,
                    path: f.path,
                    language: yamlConfiguration.backend?.language.name || "ts",
                    handler: f.handler || "handler",
                    entry: f.entry,
                    type: f.type || FunctionType.aws,
                    timeout: f.timeout,
                    storageSize: f.storageSize,
                    instanceSize: f.instanceSize,
                    vcpuCount: f.vcpuCount,
                    memoryMb: f.memoryMb,
                    maxConcurrentRequestsPerInstance: f.maxConcurrentRequestsPerInstance,
                    maxConcurrentInstances: f.maxConcurrentInstances,
                    cooldownTime: f.cooldownTime,
                    healthcheckPath: f.healthcheckPath,
                };
            }) || [];
    }
}
