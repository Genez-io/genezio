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
    MapType,
} from "../../models/genezioModels.js";
import { TriggerType } from "../../projectConfiguration/yaml/models.js";
import { goSdk } from "../templates/goSdk.js";
// const GO_FORBIDDEN_WORDS_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const GO_RESERVED_WORDS = [
    "break",
    "default",
    "func",
    "interface",
    "select",
    "case",
    "defer",
    "go",
    "map",
    "struct",
    "chan",
    "else",
    "goto",
    "package",
    "switch",
    "const",
    "fallthrough",
    "if",
    "range",
    "type",
    "continue",
    "for",
    "import",
    "return",
    "var",
    "true",
    "false",
    "iota",
    "nil",
    "int",
    "int8",
    "int16",
    "int32",
    "int64",
    "uint",
    "uint8",
    "uint16",
    "uint32",
    "uint64",
    "float32",
    "float64",
    "complex64",
    "complex128",
    "string",
    "bool",
    "byte",
    "rune",
    "uintptr",
    "array",
    "slice",
    "make",
    "new",
    "panic",
    "recover",
];

const modelsView =
    `/**
* This is an auto generated code. This code should not be modified since the file can be overwritten
* if new genezio commands are executed.
*/

package genezioSdk

{{#externalTypes}}
type {{name}} struct {
    {{#fields}}
    {{goFieldName}} {{{type}}} ` +
    '`json:"{{fieldName}}"`' +
    `
    {{/fields}}
}
{{/externalTypes}}

{{#enumTypes}}
const (
    {{#fields}}
    {{fieldName}} {{{type}}}
    {{/fields}}
)
{{/enumTypes}}
`;

const template = `/**
* This is an auto generated code. This code should not be modified since the file can be overwritten
* if new genezio commands are executed.
*/

package genezioSdk

{{#imports}}
import {{#named}}{{{name}}} {{/named}}"{{{path}}}"
{{/imports}}

{{#classDocLines}}// {{{.}}}{{/classDocLines}}
type {{{className}}} struct {
	remote *Remote
}

func New{{{className}}}() *{{{className}}} {
	return &{{{className}}}{remote: &Remote{URL: "{{{_url}}}" }}
}
{{#methods}}

{{#methodDocLines}}
// {{.}}
{{/methodDocLines}}
func (f *{{{className}}}) {{{name}}}({{#parameters}}{{{name}}}{{^last}}, {{/last}}{{/parameters}}) {{#isVoid}}error{{/isVoid}}{{^isVoid}}({{{returnType}}}, error){{/isVoid}} {
    {{#isVoid}}_{{/isVoid}}{{^isVoid}}result{{/isVoid}}, err := f.remote.Call({{{methodCaller}}}{{#sendParameters}}{{{name}}}{{^last}}, {{/last}}{{/sendParameters}})
    {{^isVoid}}
    var castResult {{{returnType}}}
    {{/isVoid}}
    if err != nil {
        return {{^isVoid}}castResult, {{/isVoid}}err
    }
    {{^isVoid}}
    {{#isPrimitiveReturnType}}
    {{#isInt}}
    castResult = int(result.(float64))
    {{/isInt}}
    {{^isInt}}
    castResult = result.({{{returnType}}})
    {{/isInt}}
    {{/isPrimitiveReturnType}}
    {{^isPrimitiveReturnType}}
    jsonMap, err := json.Marshal(result)
    if err != nil {
        return {{^isVoid}}castResult, {{/isVoid}}err
    }
    err = json.Unmarshal(jsonMap, &castResult)
    if err != nil {
        return {{^isVoid}}castResult, {{/isVoid}}err
    }
    {{/isPrimitiveReturnType}}
    {{/isVoid}}
	return {{^isVoid}}castResult, {{/isVoid}}err
}
{{/methods}}

`;

type TypesView = {
    externalTypes: ExternalType[];
    enumTypes: ExternalType[];
};

type ViewModel = {
    className: string | undefined;
    classDocLines: string[] | undefined;
    _url: string;
    methods: MethodModel[];
    imports: Import[];
};

type Import = {
    name: string;
    path: string;
    named: boolean;
};

type MethodModel = {
    name: string;
    parameters: Parameter[];
    returnType: string;
    methodCaller: string;
    sendParameters: Parameter[];
    isVoid: boolean;
    isPrimitiveReturnType: boolean;
    isInt: boolean;
    methodDocLines: string[] | undefined;
};

type ExternalType = {
    name: string;
    fields: Field[];
};

type Field = {
    type: string;
    goFieldName: string;
    fieldName: string;
};

type Parameter = {
    name: string;
    last: boolean;
};

class SdkGenerator implements SdkGeneratorInterface {
    async generateSdk(sdkGeneratorInput: SdkGeneratorInput): Promise<SdkGeneratorOutput> {
        const generateSdkOutput: SdkGeneratorOutput = {
            files: [],
        };

        const _url = "%%%link_to_be_replace%%%";

        const typesView: TypesView = {
            externalTypes: [],
            enumTypes: [],
        };

        for (const classInfo of sdkGeneratorInput.classesInfo) {
            const view: ViewModel = {
                classDocLines: undefined,
                className: undefined,
                _url: _url,
                methods: [],
                imports: [],
            };

            const externalTypes: Node[] = [];
            const classConfiguration = classInfo.classConfiguration;
            let classDefinition: ClassDefinition | undefined = undefined;

            if (classInfo.program.body === undefined) {
                continue;
            }

            for (const elem of classInfo.program.body) {
                if (elem.type === AstNodeType.ClassDefinition) {
                    classDefinition = elem as ClassDefinition;
                } else if (elem.type == AstNodeType.StructLiteral) {
                    externalTypes.push(elem);
                    const structLiteral = elem as StructLiteral;
                    for (let i = 0; i < structLiteral.typeLiteral.properties.length; i++) {
                        const property = structLiteral.typeLiteral.properties[i];
                        if (property.name == "undefined") {
                            property.name = structLiteral.name + i;
                        }
                    }
                    !this.checkIfTypeExists(structLiteral.name, typesView) &&
                        typesView.externalTypes.push({
                            name: structLiteral.name,
                            fields: structLiteral.typeLiteral.properties.map((e) => ({
                                type: this.getParamType(e),
                                goFieldName: e.name[0].toUpperCase() + e.name.slice(1),
                                fieldName: e.name,
                            })),
                        });
                } else if (elem.type == AstNodeType.Enum) {
                    const enumType = elem as Enum;
                    !this.checkIfTypeExists(enumType.name, typesView) &&
                        typesView.enumTypes.push({
                            name: enumType.name[0].toUpperCase() + enumType.name.slice(1),
                            fields: enumType.cases.map((e) => ({
                                type:
                                    typeof e.value == "number"
                                        ? ` = ${e.value}`
                                        : ` = "${e.value}"`,
                                goFieldName: e.name[0].toUpperCase() + e.name.slice(1),
                                fieldName: e.name,
                            })),
                        });
                }
            }

            if (classDefinition === undefined) {
                continue;
            }

            view.className = classDefinition.name;
            view.classDocLines = classDefinition.docString?.replace(/\n+$/, "").split("\n");

            let exportClassChecker = false;

            for (const methodDefinition of classDefinition.methods) {
                const methodConfiguration = classConfiguration.methods.find(
                    (e) => e.name === methodDefinition.name,
                );
                const methodConfigurationType =
                    methodConfiguration?.type || classConfiguration.type;
                if (
                    methodConfigurationType !== TriggerType.jsonrpc ||
                    classConfiguration.type !== TriggerType.jsonrpc
                ) {
                    continue;
                }

                exportClassChecker = true;

                const methodView: MethodModel = {
                    name: methodDefinition.name[0].toUpperCase() + methodDefinition.name.slice(1),
                    parameters: [],
                    returnType: this.getReturnType(methodDefinition.returnType),
                    isVoid: methodDefinition.returnType?.type === AstNodeType.VoidLiteral,
                    isPrimitiveReturnType: !(
                        methodDefinition.returnType?.type === AstNodeType.CustomNodeLiteral ||
                        methodDefinition.returnType?.type === AstNodeType.ArrayType ||
                        (methodDefinition.returnType?.type === AstNodeType.PromiseType &&
                            (methodDefinition.returnType?.generic.type ===
                                AstNodeType.CustomNodeLiteral ||
                                methodDefinition.returnType?.generic.type ===
                                    AstNodeType.ArrayType))
                    ),
                    isInt: methodDefinition.returnType?.type === AstNodeType.IntegerLiteral,
                    methodCaller:
                        methodDefinition.params.length === 0
                            ? `"${classDefinition.name}.${methodDefinition.name}"`
                            : `"${classDefinition.name}.${methodDefinition.name}", `,
                    sendParameters: [],
                    methodDocLines: methodDefinition.docString?.replace(/\n+$/, "").split("\n"),
                };

                if (
                    !methodView.isPrimitiveReturnType &&
                    view.imports.find((e) => e.path === "encoding/json") === undefined
                ) {
                    view.imports.push({
                        name: "encoding/json",
                        path: "encoding/json",
                        named: false,
                    });
                }

                const sanitizeGoIdentifier = (input: string): string => {
                    // Replace characters that are not allowed with underscores
                    const sanitized = input.replace(/[^a-zA-Z0-9_]/g, "_");

                    // Ensure the identifier starts with a letter or underscore
                    if (/^[^a-zA-Z_]/.test(sanitized)) {
                        return "_" + sanitized;
                    }

                    return sanitized;
                };
                methodView.parameters = methodDefinition.params.map((e) => {
                    return {
                        name:
                            (GO_RESERVED_WORDS.includes(e.name)
                                ? "_" + e.name
                                : sanitizeGoIdentifier(e.name)) +
                            " " +
                            (e.optional ? "*" : "") +
                            this.getParamType(e.paramType),
                        last: false,
                    };
                });

                methodView.sendParameters = methodDefinition.params.map((e) => {
                    return {
                        name: GO_RESERVED_WORDS.includes(e.name)
                            ? "_" + e.name
                            : sanitizeGoIdentifier(e.name),
                        last: false,
                    };
                });

                if (methodView.parameters.length > 0) {
                    methodView.parameters[methodView.parameters.length - 1].last = true;
                    methodView.sendParameters[methodView.sendParameters.length - 1].last = true;
                }

                view.methods.push(methodView);
            }

            if (!exportClassChecker) {
                continue;
            }

            const rawSdkClassName = `${classDefinition.name}.sdk.go`;
            const sdkClassName = rawSdkClassName.charAt(0).toLowerCase() + rawSdkClassName.slice(1);

            generateSdkOutput.files.push({
                path: sdkClassName,
                data: Mustache.render(template, view),
                className: classDefinition.name,
            });
        }

        // generate models.go
        (typesView.enumTypes.length > 0 || typesView.externalTypes.length > 0) &&
            generateSdkOutput.files.push({
                className: "Models",
                path: "models.go",
                data: Mustache.render(modelsView, typesView),
            });

        // generate remote.js
        generateSdkOutput.files.push({
            className: "Remote",
            path: "remote.go",
            data: goSdk,
        });

        return generateSdkOutput;
    }

    checkIfTypeExists(name: string, view: TypesView): boolean {
        return (
            view.externalTypes.some((e) => e.name === name) ||
            view.enumTypes.some((e) => e.name === name)
        );
    }

    getReturnType(returnType: Node): string {
        if (!returnType || returnType.type === AstNodeType.VoidLiteral) {
            return "";
        }

        const value = this.getParamType(returnType);
        return `${value}`;
    }

    getParamType(elem: Node | PropertyDefinition): string {
        if (elem.type === AstNodeType.CustomNodeLiteral) {
            return (elem as CustomAstNodeType).rawValue;
        } else if (elem.type === AstNodeType.StringLiteral) {
            return "string";
        } else if (elem.type === AstNodeType.IntegerLiteral) {
            return "int";
        } else if (
            elem.type === AstNodeType.FloatLiteral ||
            elem.type === AstNodeType.DoubleLiteral
        ) {
            return "float64";
        } else if (elem.type === AstNodeType.BooleanLiteral) {
            return "bool";
        } else if (elem.type === AstNodeType.AnyLiteral) {
            return "interface{}";
        } else if (elem.type === AstNodeType.ArrayType) {
            return `[]${this.getParamType((elem as ArrayType).generic)}`;
        } else if (elem.type === AstNodeType.PromiseType) {
            return `${this.getParamType((elem as PromiseType).generic)}`;
        } else if (elem.type === AstNodeType.Enum) {
            return (elem as Enum).name;
        } else if (elem.type === AstNodeType.TypeAlias) {
            return (elem as TypeAlias).name;
        } else if (elem.type === AstNodeType.UnionType) {
            return (elem as UnionType).params.map((e: Node) => this.getParamType(e)).join(" | ");
        } else if (elem.type === AstNodeType.TypeLiteral) {
            const elemTypeLiteral = elem as TypeLiteral;
            if (
                elemTypeLiteral.properties.length === 1 &&
                elemTypeLiteral.properties[0].type.type === AstNodeType.MapType
            ) {
                return this.getParamType(elemTypeLiteral.properties[0].type);
            }
            return `struct {${elemTypeLiteral.properties
                .map(
                    (e: PropertyDefinition) =>
                        `${e.name} ${e.optional ? "*" : ""}${this.getParamType(e.type)}`,
                )
                .join("; ")}}`;
        } else if (elem.type === AstNodeType.MapType) {
            return `map[${this.getParamType((elem as MapType).genericKey)}]${this.getParamType(
                (elem as MapType).genericValue,
            )}`;
        } else if (elem.type === AstNodeType.DateType) {
            return "string";
        } else if ((elem as PropertyDefinition) !== undefined) {
            const prop = elem as PropertyDefinition;
            return `${prop.optional ? "*" : ""}${this.getParamType(prop.type)}`;
        }

        return "interface{}";
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
            if ((type as CustomAstNodeType).rawValue === (externalType as StructLiteral).name) {
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
}

const supportedLanguages = ["go", "golang"];

export default { SdkGenerator, supportedLanguages };
