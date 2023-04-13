import Mustache from "mustache";
import { 
    AstNodeType,
    ClassDefinition,
    SdkGeneratorInput,
    SdkGeneratorInterface,
    SdkGeneratorOutput,
    StructLiteral,
    CustomAstNodeType,
    PromiseType,
    Node,
    MapType,
} from "../../models/genezioModels";
import { TriggerType } from "../../models/yamlProjectConfiguration";
import { dartSdk } from "../templates/dartSdk";
import { ArrayType } from "../../models/genezioModels";

// https://dart.dev/language/keywords
const DART_RESERVED_WORDS = [
    "abstract",
    "as",
    "assert",
    "async",
    "await",
    "break",
    "case",
    "catch",
    "class",
    "const",
    "continue",
    "covariant",
    "default",
    "deferred",
    "do",
    "dynamic",
    "else",
    "enum",
    "export",
    "extends",
    "extension",
    "external",
    "factory",
    "false",
    "final",
    "finally",
    "for",
    "Function",
    "get",
    "hide",
    "if",
    "implements",
    "import",
    "in",
    "interface",
    "is",
    "library",
    "mixin",
    "new",
    "null",
    "on",
    "operator",
    "part",
    "rethrow",
    "return",
    "set",
    "show",
    "static",
    "super",
    "switch",
    "sync",
    "this",
    "throw",
    "true",
    "try",
    "typedef",
    "var",
    "void",
    "while",
    "with",
    "yield",
];

const template = `/// This is an auto generated code. This code should not be modified since the file can be overwritten
/// if new genezio commands are executed.

import 'remote.dart';

{{#otherClasses}}

class {{name}} {
    {{#fields}}
        {{{type}}} {{fieldName}};
    {{/fields}}
  
    {{name}}({{#fields}}this.{{fieldName}},{{/fields}});

    {{{fromJson}}}
    
    {{{toJson}}}
}

{{/otherClasses}}

class {{{className}}} {
  static final remote = Remote("{{{_url}}}");

  {{#methods}}
  static Future<{{{returnType}}}> {{{name}}}({{#parameters}}{{{name}}}{{^last}}, {{/last}}{{/parameters}}) async {
    final response = await remote.call({{{methodCaller}}}, [{{#sendParameters}}{{{name}}}{{^last}}, {{/last}}{{/sendParameters}}]);

    {{#returnTypeJsonParser}}
    return {{returnType}}.fromJson(response);
    {{/returnTypeJsonParser}}
    {{^returnTypeJsonParser}}
    return response as {{{returnType}}};
    {{/returnTypeJsonParser}}
  }

  {{/methods}}
}
`;

class SdkGenerator implements SdkGeneratorInterface {
    async generateSdk(
        sdkGeneratorInput: SdkGeneratorInput
    ): Promise<SdkGeneratorOutput> {

        const generateSdkOutput: SdkGeneratorOutput = {
            files: []
        };

        console.log("Generating Dart SDK...", JSON.stringify(sdkGeneratorInput));

        for (const classInfo of sdkGeneratorInput.classesInfo) {
            const _url = "%%%link_to_be_replace%%%";
            const classConfiguration = classInfo.classConfiguration;

            let classDefinition: ClassDefinition | undefined = undefined;

            if (classInfo.program.body === undefined) {
                continue;
            }

            const view: any = {
                otherClasses: [],
                className: undefined,
                _url: _url,
                methods: []
            };

            let exportClassChecker = false;

            for (const elem of classInfo.program.body) {
                if (elem.type === AstNodeType.ClassDefinition) {
                    classDefinition = elem as ClassDefinition;
                    view.className = classDefinition.name;
                    for (const methodDefinition of classDefinition.methods) {
                        const methodConfigurationType = classConfiguration.getMethodType(methodDefinition.name);

                        if (methodConfigurationType !== TriggerType.jsonrpc
                            || classConfiguration.type !== TriggerType.jsonrpc
                        ) {
                            continue;
                        }

                        exportClassChecker = true;

                        const methodView: any = {
                            name: methodDefinition.name,
                            parameters: [],
                            methodCaller: methodDefinition.params.length === 0 ?
                                `"${classDefinition.name}.${methodDefinition.name}"`
                                : `"${classDefinition.name}.${methodDefinition.name}"`
                        };

                        if (methodDefinition.returnType.type === AstNodeType.PromiseType) {
                            methodView.returnType = this.getParamType(methodDefinition.returnType);

                            if ((methodDefinition.returnType as PromiseType).generic.type === AstNodeType.CustomNodeLiteral) {
                                methodView.returnTypeJsonParser = true;
                                methodView.returnType = ((methodDefinition.returnType as PromiseType).generic as CustomAstNodeType).rawValue;
                            } else {
                                methodView.returnType = this.getParamType(methodDefinition.returnType);
                            }
                        } else if (methodDefinition.returnType.type === AstNodeType.CustomNodeLiteral) {
                            methodView.returnTypeJsonParser = true;
                            methodView.returnType = methodDefinition.returnType.rawValue;
                        } else {
                            methodView.returnType = this.getParamType(methodDefinition.returnType);
                        }

                        methodView.parameters = methodDefinition.params.map((e) => {
                            return {
                                name: this.getParamType(e.paramType) + " " + (DART_RESERVED_WORDS.includes(e.name) ? e.name + "_" : e.name),
                                last: false
                            }
                        });

                        if (methodView.parameters.length > 0) {
                            methodView.parameters[methodView.parameters.length - 1].last = true;
                        }

                        methodView.sendParameters = methodDefinition.params.map((e) => {
                            return {
                                name: (DART_RESERVED_WORDS.includes(e.name) ? e.name + "_" : e.name),
                                last: false
                            }
                        });

                        if (methodView.sendParameters.length > 0) {
                            methodView.sendParameters[methodView.parameters.length - 1].last = true;
                        }

                        view.methods.push(methodView);
                    }
                } else if (elem.type === AstNodeType.StructLiteral) {
                    const structLiteral = elem as StructLiteral;
                    const fromJson = this.generateFromJsonImplementationForClass(structLiteral);
                    const toJson = this.generateToJsonImplementationForClass(structLiteral);
                    view.otherClasses.push({
                        name: structLiteral.name,
                        fields: structLiteral.typeLiteral.properties.map((e) => ({ type: this.getParamType(e.type), fieldName: e.name })),
                        fromJson: fromJson,
                        toJson: toJson
                    });
                }
            }

            if (classDefinition === undefined) {
                continue;
            }

            if (!exportClassChecker) {
                continue;
            }

            const rawSdkClassName = `${classDefinition.name}.dart`
            const sdkClassName = rawSdkClassName.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`).slice(1);

            generateSdkOutput.files.push({
                path: sdkClassName,
                data: Mustache.render(template, view),
                className: classDefinition.name
            });
        }

        // generate remote.js
        generateSdkOutput.files.push({
            className: "Remote",
            path: "remote.dart",
            data: dartSdk
        });

        return generateSdkOutput;
    }

    generateFromJsonImplementationForClass(elem: StructLiteral): string {
        let implementation = "";
        implementation += `factory ${elem.name}.fromJson(Map<String, dynamic> json) => `;
        implementation += `${elem.name}(`;

        console.log(JSON.stringify(elem));

        elem.typeLiteral.properties.forEach((e) => {
            implementation += this.generateFromJsonImplementation(e.type, e.name);
        });

        implementation += `);`;

        return implementation;
    }

    generateToJsonImplementationForClass(elem: StructLiteral): string {
        let implementation = "Map<String, dynamic> toJson() => <String, dynamic>{";
        elem.typeLiteral.properties.forEach((e) => {
            implementation += `"${e.name}": ${e.name},`;
        });
        implementation += "};";

        return implementation;
    }

    generateFromJsonImplementation(node: Node, name: string): string {
        let implementation = "";

        switch (node.type) {
            case AstNodeType.StringLiteral:
                implementation += `json['${name}'] as String,`;
                break;
            case AstNodeType.DoubleLiteral:
                implementation += `json['${name}'] as double,`;
                break;
            case AstNodeType.BooleanLiteral:
                implementation += `json['${name}'] as bool,`;
                break;
            case AstNodeType.IntegerLiteral:
                implementation += `json['${name}'] as int,`;
                break;
            case AstNodeType.CustomNodeLiteral:
                implementation += `{{${(node as CustomAstNodeType).rawValue}}}.fromJson(json as Map<String, dynamic>),`;
                break;
            case AstNodeType.ArrayType:
                implementation += this.generateFromJsonImplementationForArrayInitial(node as ArrayType, name);
                break;
            case AstNodeType.MapType:
                implementation += this.generateFromJsonImplementationForMapInitial(node as MapType, name);
        }

        return implementation;
    }

    generateFromJsonImplementationForNode(node: Node): string {
        let implementation = "";

        switch (node.type) {
            case AstNodeType.StringLiteral:
                implementation += `e as String`;
                break;
            case AstNodeType.DoubleLiteral:
                implementation += `e as double`;
                break;
            case AstNodeType.BooleanLiteral:
                implementation += `e as bool`;
                break;
            case AstNodeType.IntegerLiteral:
                implementation += `e as int`;
                break;
            case AstNodeType.CustomNodeLiteral:
                implementation += `${(node as CustomAstNodeType).rawValue}.fromJson(e as Map<String, dynamic>),`;
                break;
            case AstNodeType.ArrayType:
                implementation += this.generateFromJsonImplementationForArray((node as ArrayType).generic);
                break;
            case AstNodeType.MapType:
                implementation += this.generateFromJsonImplementationForMap((node as MapType).genericValue);

        }

        return implementation;
    }

    generateFromJsonImplementationForMapInitial(mapType: MapType, name: string): string {
        let implementation = "";
        implementation += `(json['${name}'] as Map<${this.getParamType(mapType.genericKey)}, dynamic>).map((k, e) => MapEntry(k,`;
        implementation += this.generateFromJsonImplementationForNode(mapType.genericValue);
        implementation += `)),`;

        return implementation;
    }

    generateFromJsonImplementationForArrayInitial(arrayType: ArrayType, name: string): string {
        let implementation = "";

        implementation += `(json['${name}'] as List<dynamic>).map((e) => `;
        implementation += this.generateFromJsonImplementationForNode(arrayType.generic);
        implementation += `).toList()`;

        return implementation;
    }

    generateFromJsonImplementationForArray(node: Node): string {
        let implementation = "";

        implementation += '(e as List<dynamic>).map((e) =>';
        implementation += this.generateFromJsonImplementationForNode(node)
        implementation += ').toList()';

        return implementation;
    }

    generateFromJsonImplementationForMap(node: Node): string {
        let implementation = "";

        implementation += '(e as Map<String, dynamic>).map((k, e) => MapEntry(k,';
        implementation += this.generateFromJsonImplementationForNode(node)
        implementation += '))';

        return implementation;
    }

    getParamType(elem: Node): string {
        switch (elem.type) {
            case AstNodeType.StringLiteral:
                return "String";
            case AstNodeType.DoubleLiteral:
                return "double";
            case AstNodeType.BooleanLiteral:
                return "bool";
            case AstNodeType.IntegerLiteral:
                return "int";
            case AstNodeType.AnyLiteral:
                return "Object";
            case AstNodeType.ArrayType:
                return `List<${this.getParamType((elem as ArrayType).generic)}>`;
            case AstNodeType.MapType:
                return `Map<${this.getParamType((elem as MapType).genericKey)}, ${this.getParamType((elem as MapType).genericValue)}>`;
            case AstNodeType.CustomNodeLiteral:
                return (elem as CustomAstNodeType).rawValue;
            case AstNodeType.PromiseType:
                return this.getParamType((elem as PromiseType).generic);
            default:
                return "Object";
        }
    }
}

const supportedLanguages = ["dart"];

export default { SdkGenerator, supportedLanguages }
