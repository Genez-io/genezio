import Mustache from "mustache";
import { AstNodeType, ClassDefinition, CustomNodeType, Node, SdkGeneratorInput, SdkGeneratorInterface, SdkGeneratorOutput, StructLiteral, TypeAlias } from "../../models/genezioAst";
import { TriggerType } from "../../models/yamlProjectConfiguration";
import { dartSdk } from "../templates/dartSdk";

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

    factory {{name}}.fromJson(Map<String, dynamic> json) {
        return {{name}}(
            {{#fields}}
                json['{{fieldName}}'] as {{{type}}},
            {{/fields}}
          );
      }
    
      Map<String, dynamic> toJson() {
        return <String, dynamic>{
            {{#fields}}
                '{{fieldName}}': this.{{fieldName}},
            {{/fields}}
        };
      }
}

{{/otherClasses}}

class {{{className}}} {
  static final remote = Remote("{{{_url}}}");

  {{#methods}}
  static Future<{{returnType}}> {{{name}}}({{#parameters}}{{{name}}}{{^last}}, {{/last}}{{/parameters}}) async {
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

                        if (methodDefinition.returnType.type === AstNodeType.CustomNodeLiteral) {
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
                    view.otherClasses.push({
                        name: structLiteral.name,
                        fields: structLiteral.typeLiteral.properties.map((e) => ({ type: this.getParamType(e.type), fieldName: e.name })),
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
            case AstNodeType.CustomNodeLiteral:
                return (elem as CustomNodeType).rawValue;
            default:
                return "Object";
        }
    }
}

const supportedLanguages = ["dart"];

export default { SdkGenerator, supportedLanguages }
