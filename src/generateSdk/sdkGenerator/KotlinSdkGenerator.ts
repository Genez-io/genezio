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
    SdkVersion,
} from "../../models/genezioModels.js";
import { TriggerType } from "../../models/yamlProjectConfiguration.js";
import { kotlinSdk } from "../templates/kotlinSdk.js";
import { ArrayType } from "../../models/genezioModels.js";
import {
    castArrayRecursivelyInitial,
    castMapRecursivelyInitial,
    getParamType,
} from "../../utils/kotlinAstCasting.js";

// https://kotlinlang.org/docs/keyword-reference.html
const KOTLIN_RESERVED_KEYWORDS = [
    "as",
    "is",
    "as?",
    "break",
    "class",
    "continue",
    "do",
    "else",
    "false",
    "for",
    "fun",
    "if",
    "in",
    "!in",
    "interface",
    "is",
    "!is",
    "null",
    "object",
    "package",
    "return",
    "super",
    "this",
    "throw",
    "true",
    "try",
    "typealias",
    "typeof",
    "val",
    "var",
    "when",
    "while",
    "by",
    "catch",
    "constructor",
    "delegate",
    "dynamic",
    "field",
    "file",
    "finally",
    "get",
    "import",
    "init",
    "param",
    "property",
    "receiver",
    "set",
    "setparam",
    "value",
    "where",
    "abstract",
    "actual",
    "annotation",
    "companion",
    "const",
    "crossinline",
    "data",
    "enum",
    "expect",
    "external",
    "final",
    "infix",
    "inline",
    "inner",
    "internal",
    "lateinit",
    "noinline",
    "open",
    "operator",
    "out",
    "override",
    "private",
    "protected",
    "public",
    "reified",
    "sealed",
    "suspend",
    "tailrec",
    "vararg",
    "field",
    "it",
];

// TODO: Handle "package" in a more robust way, non-hardcoded
const template = `// This is an auto generated code. This code should not be modified since the file can be overwritten
// if new genezio commands are executed.
package com.genezio.sdk

import com.google.gson.Gson
import com.google.gson.JsonElement
import com.google.gson.reflect.TypeToken

// User Classes 
{{#otherClasses}}

data class {{name}} (
  {{#fields}}
  var {{fieldName}} : {{{type}}},
  {{/fields}}
) {
}

{{/otherClasses}}

class {{{className}}} {
  private val remote = Remote("{{{_url}}}/")
  private val gson = Gson()

  {{#methods}}
    suspend fun {{{name}}}({{#parameters}}{{{name}}}{{^last}}, {{/last}}{{/parameters}}): {{{returnType}}} {
        val params = listOf<JsonElement>(
          {{#sendParameters}}
          gson.toJsonTree({{{name}}}){{^last}}, {{/last}}
          {{/sendParameters}}           
        )

        val type = object : TypeToken<{{{returnType}}}>(){}.type
        {{#returnTypeCast}}
        var res : {{{returnType}}}

        res = remote.makeRequest(type, {{{methodCaller}}}, params)
        

        return res
        {{/returnTypeCast}}
        {{^returnTypeCast}}
        val res = remote.makeRequest(type, {{{methodCaller}}}, params)
        {{/returnTypeCast}}
    }
    {{/methods}}
}
`;

class SdkGenerator implements SdkGeneratorInterface {
    async generateSdk(sdkGeneratorInput: SdkGeneratorInput): Promise<SdkGeneratorOutput> {
        const generateSdkOutput: SdkGeneratorOutput = {
            files: [],
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
                methods: [],
            };

            let exportClassChecker = false;

            for (const elem of classInfo.program.body) {
                if (elem.type === AstNodeType.ClassDefinition) {
                    classDefinition = elem as ClassDefinition;
                    view.className = classDefinition.name;
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

                        const methodView: any = {
                            name: methodDefinition.name,
                            parameters: [],
                            methodCaller:
                                methodDefinition.params.length === 0
                                    ? `"${classDefinition.name}.${methodDefinition.name}"`
                                    : `"${classDefinition.name}.${methodDefinition.name}"`,
                        };

                        if (methodDefinition.returnType.type === AstNodeType.VoidLiteral) {
                            methodView.returnType = this.getReturnType(methodDefinition.returnType);
                            methodView.returnTypeCast = undefined;
                        } else {
                            methodView.returnTypeCast = this.castReturnTypeToPropertyType(
                                methodDefinition.returnType,
                                "response",
                            );
                            methodView.returnType = this.getReturnType(methodDefinition.returnType);
                        }

                        methodView.parameters = methodDefinition.params.map((e) => {
                            return {
                                name:
                                    (KOTLIN_RESERVED_KEYWORDS.includes(e.name)
                                        ? e.name + "_"
                                        : e.name) +
                                    ": " +
                                    getParamType(e.paramType),
                                last: false,
                            };
                        });

                        if (methodView.parameters.length > 0) {
                            methodView.parameters[methodView.parameters.length - 1].last = true;
                        }

                        methodView.sendParameters = methodDefinition.params.map((e) => {
                            return {
                                name: KOTLIN_RESERVED_KEYWORDS.includes(e.name)
                                    ? e.name + "_"
                                    : e.name,
                                last: false,
                            };
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
                        fields: structLiteral.typeLiteral.properties.map((e) => ({
                            type: getParamType(e.type),
                            fieldName: e.name,
                        })),
                    });
                }
            }

            if (classDefinition === undefined) {
                continue;
            }

            if (!exportClassChecker) {
                continue;
            }

            const rawSdkClassName = `${classDefinition.name}.kt`;
            const sdkClassName = rawSdkClassName
                .replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
                .slice(1);

            generateSdkOutput.files.push({
                path: sdkClassName,
                data: Mustache.render(template, view),
                className: classDefinition.name,
            });
        }

        // generate remote.kt
        generateSdkOutput.files.push({
            className: "Remote",
            path: "remote.kt",
            data: kotlinSdk,
        });

        return generateSdkOutput;
    }

    castReturnTypeToPropertyType(node: Node, variableName: string): string {
        let implementation = "";

        switch (node.type) {
            case AstNodeType.StringLiteral:
                implementation += `${variableName}.toString().substring(1, ${variableName}.toString().length - 1)`;
                break;
            case AstNodeType.DoubleLiteral:
                implementation += `${variableName}.toDouble()`;
                break;
            case AstNodeType.BooleanLiteral:
                implementation += `${variableName}.toString().toBoolean()`;
                break;
            case AstNodeType.IntegerLiteral:
                implementation += `Integer.parseInt(${variableName}.toString())`;
                break;
            case AstNodeType.CustomNodeLiteral:
                implementation += `Json.decodeFromString<${
                    (node as CustomAstNodeType).rawValue
                }>(${variableName}.toString())`;
                break;
            case AstNodeType.ArrayType:
                implementation += castArrayRecursivelyInitial(node as ArrayType, variableName);
                break;
            case AstNodeType.MapType:
                implementation += castMapRecursivelyInitial(node as MapType, variableName);
        }

        return implementation;
    }

    getReturnType(elem: Node): string {
        switch (elem.type) {
            case AstNodeType.StringLiteral:
                return "String";
            case AstNodeType.DoubleLiteral:
                return "Double";
            case AstNodeType.BooleanLiteral:
                return "Boolean";
            case AstNodeType.IntegerLiteral:
                return "Int";
            case AstNodeType.AnyLiteral:
                return "Abject";
            case AstNodeType.VoidLiteral:
                return "Unit";
            case AstNodeType.PromiseType:
                return `${getParamType((elem as PromiseType).generic)}`;
            case AstNodeType.ArrayType:
                return `List<${getParamType((elem as ArrayType).generic)}>`;
            case AstNodeType.MapType:
                return `Map<${getParamType((elem as MapType).genericKey)}, ${getParamType(
                    (elem as MapType).genericValue,
                )}>`;
            case AstNodeType.CustomNodeLiteral:
                return `${(elem as CustomAstNodeType).rawValue}`;
            case AstNodeType.DateType:
                return "Date";
            default:
                return "Any";
        }
    }
}

const supportedLanguages = ["kt", "kotlin"];

export default { SdkGenerator, supportedLanguages };
