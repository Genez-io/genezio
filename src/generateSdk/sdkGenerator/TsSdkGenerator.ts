import Mustache from "mustache";
import {
    AstNodeType,
    ClassDefinition,
    SdkGeneratorInput,
    SdkGeneratorInterface,
    SdkGeneratorOutput,
    TypeAlias,
    Node,
    UnionType,
    CustomAstNodeType,
    ArrayType,
    PropertyDefinition,
    Enum,
    TypeLiteral,
    StructLiteral,
    PromiseType,
    MethodDefinition,
    ParameterDefinition,
    ModelView,
    IndexModel,
    MapType,
    SdkGeneratorClassesInfoInput,
} from "../../models/genezioModels.js";
import { TriggerType } from "../../models/yamlProjectConfiguration.js";
import { nodeSdkTs } from "../templates/nodeSdkTs.js";
import path from "path";

const TYPESCRIPT_RESERVED_WORDS = [
    "abstract",
    "as",
    "asserts",
    "async",
    "await",
    "boolean",
    "break",
    "case",
    "catch",
    "class",
    "const",
    "constructor",
    "continue",
    "declare",
    "default",
    "delete",
    "do",
    "else",
    "enum",
    "export",
    "extends",
    "false",
    "finally",
    "for",
    "from",
    "function",
    "get",
    "if",
    "implements",
    "import",
    "in",
    "infer",
    "instanceof",
    "interface",
    "is",
    "keyof",
    "let",
    "module",
    "namespace",
    "never",
    "new",
    "null",
    "number",
    "object",
    "of",
    "package",
    "private",
    "protected",
    "public",
    "readonly",
    "require",
    "global",
    "return",
    "set",
    "static",
    "string",
    "super",
    "switch",
    "symbol",
    "this",
    "throw",
    "true",
    "try",
    "type",
    "typeof",
    "unique",
    "unknown",
    "var",
    "void",
    "while",
    "with",
    "yield",
    "async",
    "await",
    "of",
];

const indexTemplate = `/**
* This is an auto generated code. This code should not be modified since the file can be overwritten
* if new genezio commands are executed.
*/

{{#imports}}
import { {{#models}}{{{name}}}{{^last}}, {{/last}}{{/models}} } from "./{{{path}}}";
{{/imports}}

export { {{#exports}}{{{name}}}{{^last}}, {{/last}}{{/exports}} };
`;

const modelTemplate = `/**
* This is an auto generated code. This code should not be modified since the file can be overwritten
* if new genezio commands are executed.
*/

{{#imports}}
import { {{#models}}{{{name}}}{{^last}}, {{/last}}{{/models}} } from "./{{{path}}}";
{{/imports}}

{{#externalTypes}}
export {{{type}}}
{{/externalTypes}}
`;

const template = `/**
* This is an auto generated code. This code should not be modified since the file can be overwritten
* if new genezio commands are executed.
*/

import { Remote } from "./remote";
{{#imports}}
import { {{#models}}{{{name}}}{{^last}}, {{/last}}{{/models}} } from "./{{{path}}}";
{{/imports}}

{{#hasGnzContext}}
export class LocalStorageWrapper implements Storage {
  setItem(key: string, value: string): void {
    localStorage.setItem(key, value);
  }

  getItem(key: string): string | null {
    return localStorage.getItem(key);
  }

  removeItem(key: string): void {
    localStorage.removeItem(key);
  }

  clear(): void {
    localStorage.clear();
  }
}

export class StorageManager {
  private static storage: Storage|null = null;
  static getStorage(): Storage {
    if (!this.storage) {
      this.storage = new LocalStorageWrapper();
    }
    return this.storage;
  }
  static setStorage(storage: Storage): void {
    this.storage = storage;
  }
}
{{/hasGnzContext}}


{{#externalTypes}}
export {{{type}}}
{{/externalTypes}}

export class {{{className}}} {
  static remote = new Remote("{{{_url}}}");

  {{#methods}}
  {{#hasGnzContextAsFirstParameter}}
  static async {{{name}}}({{#parameters}}{{{name}}}{{^last}}, {{/last}}{{/parameters}}){{{returnType}}} {
    return await {{{className}}}.remote.call({{{methodCaller}}} {"token": StorageManager.getStorage().getItem("token")}, {{#sendParameters}}{{{name}}}{{^last}}, {{/last}}{{/sendParameters}});
  }
  {{/hasGnzContextAsFirstParameter}}
  {{^hasGnzContextAsFirstParameter}}
  static async {{{name}}}({{#parameters}}{{{name}}}{{^last}}, {{/last}}{{/parameters}}){{{returnType}}} {
    return await {{{className}}}.remote.call({{{methodCaller}}}{{#sendParameters}}{{{name}}}{{^last}}, {{/last}}{{/sendParameters}});
  }
  {{/hasGnzContextAsFirstParameter}}
  {{/methods}}
}

export { Remote };
`;

type MethodViewType = {
    name: string;
    parameters: {
        name: string;
        last?: boolean;
    }[];
    returnType: string;
    methodCaller: string;
    sendParameters: {
        name: string;
        last?: boolean;
    }[];
    hasGnzContextAsFirstParameter: boolean;
};

type ViewType = {
    className: string;
    _url: string;
    methods: MethodViewType[];
    externalTypes: {
        name: string;
        type: string;
    }[];
    imports: {
        path: string;
        models: {
            name: string;
            last?: boolean;
        }[];
    }[];
    hasGnzContext: boolean;
};

class SdkGenerator implements SdkGeneratorInterface {
    async generateSdk(sdkGeneratorInput: SdkGeneratorInput): Promise<SdkGeneratorOutput> {
        const generateSdkOutput: SdkGeneratorOutput = {
            files: [],
        };

        const modelViews: ModelView[] = [];
        const indexModel: IndexModel = {
            imports: [],
            exports: [],
        };

        for (const classInfo of sdkGeneratorInput.classesInfo) {
            const externalTypes: Node[] = [];
            const _url = "%%%link_to_be_replace%%%";
            const classConfiguration = classInfo.classConfiguration;

            let classDefinition: ClassDefinition | undefined = undefined;

            if (classInfo.program.body === undefined) {
                continue;
            }
            for (const elem of classInfo.program.body) {
                if (elem.type === AstNodeType.ClassDefinition) {
                    classDefinition = elem as ClassDefinition;
                } else {
                    externalTypes.push(elem);
                }
            }

            if (classDefinition === undefined) {
                continue;
            }

            // @ts-expect-error A refactor need to be performed here to avoid this error
            const view: ViewType = {
                className: classDefinition.name,
                _url: _url,
                methods: [],
                externalTypes: [],
                imports: [],
            };

            let exportClassChecker = false;

            for (const methodDefinition of classDefinition.methods) {
                const methodConfigurationType = classConfiguration.getMethodType(
                    methodDefinition.name,
                );

                if (
                    methodConfigurationType !== TriggerType.jsonrpc ||
                    classConfiguration.type !== TriggerType.jsonrpc
                ) {
                    continue;
                }

                exportClassChecker = true;

                // @ts-expect-error A refactor need to be performed here to avoid this error
                const methodView: MethodViewType = {
                    // methods start with lowercase
                    name:
                        methodDefinition.name.charAt(0).toLowerCase() +
                        methodDefinition.name.slice(1),
                    parameters: [],
                    returnType: this.getReturnType(methodDefinition.returnType),
                    methodCaller:
                        methodDefinition.params.length === 0
                            ? `"${classDefinition.name}.${methodDefinition.name}"`
                            : `"${classDefinition.name}.${methodDefinition.name}", `,
                };

                // @ts-expect-error A refactor need to be performed here to avoid this error
                methodView.parameters = methodDefinition.params
                    .map((e) => {
                        // GnzContext is a special type used to pass auth token and other information to the remote call
                        if (
                            e.paramType.type === AstNodeType.CustomNodeLiteral &&
                            e.paramType.rawValue === "GnzContext"
                        ) {
                            methodView.hasGnzContextAsFirstParameter = true;
                            view.hasGnzContext = true;
                            return undefined;
                        }
                        return {
                            name:
                                (TYPESCRIPT_RESERVED_WORDS.includes(e.name)
                                    ? e.name + "_"
                                    : e.name) +
                                (e.optional ? "?" : "") +
                                ": " +
                                this.getParamType(e.paramType) +
                                (e.defaultValue
                                    ? " = " +
                                      (e.defaultValue.type === AstNodeType.StringLiteral
                                          ? "'" + e.defaultValue.value + "'"
                                          : e.defaultValue.value)
                                    : ""),
                            last: false,
                        };
                    })
                    .filter((e) => e !== undefined);

                // @ts-expect-error A refactor need to be performed here to avoid this error
                methodView.sendParameters = methodDefinition.params
                    .map((e) => {
                        // GnzContext is a special type used to pass auth token and other information to the remote call
                        if (
                            e.paramType.type === AstNodeType.CustomNodeLiteral &&
                            e.paramType.rawValue === "GnzContext"
                        ) {
                            methodView.hasGnzContextAsFirstParameter = true;
                            view.hasGnzContext = true;
                            return undefined;
                        }
                        return {
                            name: TYPESCRIPT_RESERVED_WORDS.includes(e.name)
                                ? e.name + "_"
                                : e.name,
                            last: false,
                        };
                    })
                    .filter((e) => e !== undefined);

                if (methodView.parameters.length > 0) {
                    methodView.parameters[methodView.parameters.length - 1].last = true;
                    methodView.sendParameters[methodView.sendParameters.length - 1].last = true;
                }

                view.methods.push(methodView);
            }

            for (const externalType of externalTypes) {
                if (externalType.path) {
                    let currentView: ModelView | undefined = undefined;
                    for (const parentType of externalTypes) {
                        const isUsed = this.isExternalTypeUsedByOtherType(externalType, parentType);
                        if (isUsed && parentType.path && parentType.path !== externalType.path) {
                            currentView = this.addViewIfNotExists(
                                modelViews,
                                parentType,
                                view,
                                classInfo,
                            );
                        }
                        const classPath = classInfo.classConfiguration.path.replace(/\\/g, "/");
                        if (currentView && !classPath.includes(externalType.path)) {
                            this.addImportToCurrentView(currentView, externalType);
                        }
                    }
                    if (this.isExternalTypeUsedInMethod(externalType, classDefinition.methods)) {
                        // @ts-expect-error A refactor need to be performed here to avoid this error
                        currentView = view;
                        const classPath = classInfo.classConfiguration.path.replace(/\\/g, "/");
                        if (currentView && !classPath.includes(externalType.path)) {
                            this.addImportToCurrentView(currentView, externalType);
                        }
                    }

                    currentView = this.addViewIfNotExists(
                        modelViews,
                        externalType,
                        view,
                        classInfo,
                    );
                    if (
                        !currentView?.externalTypes.find(
                            // eslint-disable-next-line  @typescript-eslint/no-explicit-any
                            (e) => e.name === (externalType as any).name,
                        )
                    ) {
                        currentView?.externalTypes.push({
                            type: this.generateExternalType(externalType),
                            // eslint-disable-next-line  @typescript-eslint/no-explicit-any
                            name: (externalType as any).name,
                        });
                    }
                }
            }

            for (const modelView of modelViews) {
                for (const importType of modelView.imports) {
                    if (importType.models.length > 0) {
                        importType.models[importType.models.length - 1].last = true;
                    }
                }
            }

            for (const importType of view.imports) {
                if (importType.models.length > 0) {
                    importType.models[importType.models.length - 1].last = true;
                }
            }

            if (!exportClassChecker) {
                continue;
            }

            this.addClassItemsToIndex(
                indexModel,
                classInfo.program.body,
                classDefinition.path ?? "",
                classDefinition.name,
            );

            const rawSdkClassName = `${classDefinition.name}.sdk.ts`;
            const sdkClassName = rawSdkClassName.charAt(0).toLowerCase() + rawSdkClassName.slice(1);

            generateSdkOutput.files.push({
                path: sdkClassName,
                data: Mustache.render(template, view),
                className: classDefinition.name,
            });

            for (const modelView of modelViews) {
                generateSdkOutput.files.push({
                    path: modelView.path + ".ts",
                    data: Mustache.render(modelTemplate, modelView),
                    className: "",
                });
            }
        }

        // generate remote.js
        generateSdkOutput.files.push({
            className: "Remote",
            path: "remote.ts",
            data: nodeSdkTs.replace("%%%url%%%", "undefined"),
        });

        if (indexModel.exports.length > 0) {
            indexModel.exports[indexModel.exports.length - 1].last = true;
        }
        for (const importStatement of indexModel.imports) {
            if (importStatement.models.length > 0) {
                importStatement.models[importStatement.models.length - 1].last = true;
            }
        }
        generateSdkOutput.files.push({
            className: "index.ts",
            path: "index.ts",
            data: Mustache.render(indexTemplate, indexModel),
        });

        return generateSdkOutput;
    }

    getReturnType(returnType: Node): string {
        if (!returnType || returnType.type === AstNodeType.VoidLiteral) {
            return "";
        }

        let value = this.getParamType(returnType);
        if (returnType.type !== AstNodeType.PromiseType) {
            value = `Promise<${value}>`;
        }

        return `: ${value}`;
    }

    getParamType(elem: Node): string {
        if (elem.type === AstNodeType.CustomNodeLiteral) {
            return (elem as CustomAstNodeType).rawValue;
        } else if (elem.type === AstNodeType.StringLiteral) {
            return "string";
        } else if (
            elem.type === AstNodeType.IntegerLiteral ||
            elem.type === AstNodeType.FloatLiteral ||
            elem.type === AstNodeType.DoubleLiteral
        ) {
            return "number";
        } else if (elem.type === AstNodeType.BooleanLiteral) {
            return "boolean";
        } else if (elem.type === AstNodeType.AnyLiteral) {
            return "any";
        } else if (elem.type === AstNodeType.ArrayType) {
            return `Array<${this.getParamType((elem as ArrayType).generic)}>`;
        } else if (elem.type === AstNodeType.PromiseType) {
            return `Promise<${this.getParamType((elem as PromiseType).generic)}>`;
        } else if (elem.type === AstNodeType.Enum) {
            return (elem as Enum).name;
        } else if (elem.type === AstNodeType.TypeAlias) {
            return (elem as TypeAlias).name;
        } else if (elem.type === AstNodeType.UnionType) {
            return (elem as UnionType).params.map((e: Node) => this.getParamType(e)).join(" | ");
        } else if (elem.type === AstNodeType.TypeLiteral) {
            return `{${(elem as TypeLiteral).properties
                .map((e: PropertyDefinition) => {
                    if (e.type.type === AstNodeType.MapType) {
                        return `[key: ${this.getParamType(
                            (e.type as MapType).genericKey,
                        )}]: ${this.getParamType((e.type as MapType).genericValue)}`;
                    } else {
                        return `${e.name}${e.optional ? "?" : ""}: ${this.getParamType(e.type)}`;
                    }
                })
                .join(", ")}}`;
        } else if (elem.type === AstNodeType.DateType) {
            return "Date";
        }
        return "any";
    }

    generateExternalType(type: Node): string {
        if (type.type === AstNodeType.TypeAlias) {
            const typeAlias = type as TypeAlias;
            return `type ${typeAlias.name} = ${this.getParamType(typeAlias.aliasType)};`;
        } else if (type.type === AstNodeType.Enum) {
            const enumType = type as Enum;
            return `enum ${enumType.name} {${enumType.cases
                .map((c) => {
                    if (c.type === AstNodeType.StringLiteral) {
                        return `${c.name} = "${c.value}"`;
                    } else if (c.type === AstNodeType.DoubleLiteral) {
                        if (c.value !== undefined && c.value !== null) {
                            return `${c.name} = ${c.value}`;
                        } else {
                            return `${c.name}`;
                        }
                    }
                })
                .join(", ")}}`;
        } else if (type.type === AstNodeType.StructLiteral) {
            const typeAlias = type as StructLiteral;
            return `type ${typeAlias.name} = ${this.getParamType(typeAlias.typeLiteral)};`;
        }
        return "";
    }

    isExternalTypeUsedByOtherType(externalType: Node, type: Node): boolean {
        if (type.type === AstNodeType.TypeAlias) {
            const typeAlias = type as TypeAlias;
            return this.isExternalTypeUsedByOtherType(externalType, typeAlias.aliasType);
        } else if (type.type === AstNodeType.Enum) {
            return false;
        } else if (type.type === AstNodeType.StructLiteral) {
            const typeAlias = type as StructLiteral;
            return this.isExternalTypeUsedByOtherType(externalType, typeAlias.typeLiteral);
        } else if (type.type === AstNodeType.ArrayType) {
            return this.isExternalTypeUsedByOtherType(externalType, (type as ArrayType).generic);
        } else if (type.type === AstNodeType.PromiseType) {
            return this.isExternalTypeUsedByOtherType(externalType, (type as PromiseType).generic);
        } else if (type.type === AstNodeType.UnionType) {
            return (type as UnionType).params.some((e: Node) =>
                this.isExternalTypeUsedByOtherType(externalType, e),
            );
        } else if (type.type === AstNodeType.TypeLiteral) {
            return (type as TypeLiteral).properties.some((e: PropertyDefinition) =>
                this.isExternalTypeUsedByOtherType(externalType, e.type),
            );
        } else if (type.type === AstNodeType.DateType) {
            return false;
        } else if (type.type === AstNodeType.CustomNodeLiteral) {
            // eslint-disable-next-line  @typescript-eslint/no-explicit-any
            if ((type as CustomAstNodeType).rawValue === (externalType as any).name) {
                return true;
            }
            return false;
        } else if (type.type === AstNodeType.StringLiteral) {
            return false;
        } else if (
            type.type === AstNodeType.IntegerLiteral ||
            type.type === AstNodeType.FloatLiteral ||
            type.type === AstNodeType.DoubleLiteral
        ) {
            return false;
        } else if (type.type === AstNodeType.BooleanLiteral) {
            return false;
        } else if (type.type === AstNodeType.AnyLiteral) {
            return false;
        }
        return false;
    }

    isExternalTypeUsedInMethod(externalType: Node, methods: MethodDefinition[]): boolean {
        return methods.some(
            (m) =>
                this.isExternalTypeUsedByOtherType(externalType, m.returnType) ||
                m.params.some((p: ParameterDefinition) =>
                    this.isExternalTypeUsedByOtherType(externalType, p.paramType),
                ),
        );
    }

    addImportToCurrentView(currentView: ModelView, externalType: Node) {
        let found = false;
        for (const importType of currentView.imports) {
            if (
                importType.path === externalType.path &&
                // eslint-disable-next-line  @typescript-eslint/no-explicit-any
                !importType.models.find((e: any) => e.name === (externalType as any).name)
            ) {
                // eslint-disable-next-line  @typescript-eslint/no-explicit-any
                importType.models.push({ name: (externalType as any).name });
                found = true;
                break;
            }
        }
        if (!found) {
            let relativePath = path.relative(currentView.path || ".", externalType.path || ".");
            while (relativePath.substring(0, 3) == "../") {
                relativePath = relativePath.substring(3);
            }
            // eslint-disable-next-line  @typescript-eslint/no-explicit-any
            if (!currentView.imports.find((e: any) => e.path === relativePath)) {
                currentView.imports.push({
                    path: relativePath.replace(/\\/g, "/"),
                    // eslint-disable-next-line  @typescript-eslint/no-explicit-any
                    models: [{ name: (externalType as any).name }],
                });
            }
        }
    }

    addClassItemsToIndex(
        indexModel: IndexModel,
        classItems: Node[],
        classPath: string,
        className: string,
    ) {
        for (const originalClassItem of classItems) {
            const classItem = { ...originalClassItem };
            if (classItem.path === classPath) {
                const rawSdkClassPath = `${className}.sdk`;
                const sdkClassPath =
                    rawSdkClassPath.charAt(0).toLowerCase() + rawSdkClassPath.slice(1);
                classItem.path = sdkClassPath;
            }
            const index = indexModel.imports.findIndex((i) => i.path === classItem.path);
            if (index !== -1) {
                if (
                    // eslint-disable-next-line  @typescript-eslint/no-explicit-any
                    indexModel.imports[index].models.find((i) => i.name === (classItem as any).name)
                ) {
                    continue;
                } else {
                    indexModel.imports[index].models.push({
                        // eslint-disable-next-line  @typescript-eslint/no-explicit-any
                        name: (classItem as any).name,
                    });
                    // eslint-disable-next-line  @typescript-eslint/no-explicit-any
                    indexModel.exports.push({ name: (classItem as any).name });
                }
            } else {
                indexModel.imports.push({
                    path: classItem.path || "",
                    // eslint-disable-next-line  @typescript-eslint/no-explicit-any
                    models: [{ name: (classItem as any).name }],
                });
                // eslint-disable-next-line  @typescript-eslint/no-explicit-any
                indexModel.exports.push({ name: (classItem as any).name });
            }
        }
    }

    addViewIfNotExists(
        modelViews: ModelView[],
        type: Node,
        classView: ViewType,
        classInfo: SdkGeneratorClassesInfoInput,
    ) {
        let found = false;
        let currentView: ModelView | undefined = undefined;
        for (const modelView of modelViews) {
            if (modelView.path === type.path) {
                currentView = modelView;
                found = true;
                break;
            }
        }
        if (!found) {
            const classPath = classInfo.classConfiguration.path.replace(/\\/g, "/");
            // @ts-expect-error A refactor need to be performed here to avoid this cast
            if (!classPath.includes(type.path)) {
                currentView = {
                    path: type.path || "",
                    externalTypes: [],
                    imports: [],
                };
                modelViews.push(currentView);
            } else {
                // @ts-expect-error A refactor need to be performed here to avoid this cast
                currentView = classView as ModelView;
            }
        }
        return currentView;
    }
}

const supportedLanguages = ["ts", "typescript"];

export default { SdkGenerator, supportedLanguages };
