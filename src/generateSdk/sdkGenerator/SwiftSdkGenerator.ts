import Mustache from "mustache";
import {
    ClassDefinition,
    AstNodeType,
    SdkGeneratorInterface,
    SdkGeneratorInput,
    SdkGeneratorOutput,
    Node,
    ArrayType,
    PromiseType,
} from "../../models/genezioModels.js";
import { TriggerType } from "../../projectConfiguration/yaml/models.js";
import { swiftSdk } from "../templates/swiftSdk.js";

const SWIFT_RESERVED_WORDS = [
    "associativity",
    "convenience",
    "didSet",
    "dynamic",
    "final",
    "get",
    "indirect",
    "infix",
    "lazy",
    "left",
    "mutating",
    "none",
    "nonmutating",
    "optional",
    "override",
    "postfix",
    "precedence",
    "prefix",
    "Protocol",
    "required",
    "right",
    "set",
    "some",
    "Type",
    "unowned",
    "weak",
    "willSet",
];

const template = `/**
* This is an auto generated code. This code should not be modified since the file can be overwritten
* if new genezio commands are executed.
*/

import Foundation

class {{{className}}} {
  public static let remote = Remote(url: "{{{_url}}}")

  {{#methods}}
  static func {{{name}}}({{#parameters}}{{{name}}}{{^last}}, {{/last}}{{/parameters}}) async -> {{{returnType}}} {
    return await {{{className}}}.remote.call(method: {{{methodCaller}}}{{#sendParameters}}{{{name}}}{{^last}}, {{/last}}{{/sendParameters}})
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
            for (const elem of classInfo.program.body) {
                if (elem.type === AstNodeType.ClassDefinition) {
                    classDefinition = elem as ClassDefinition;
                }
            }

            if (classDefinition === undefined) {
                continue;
            }

            const view: any = {
                className: classDefinition.name,
                _url: _url,
                methods: [],
                externalTypes: [],
            };

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

                const methodView: any = {
                    name: methodDefinition.name,
                    parameters: [],
                    returnType: this.getParamType(methodDefinition.returnType),
                    methodCaller:
                        methodDefinition.params.length === 0
                            ? `"${classDefinition.name}.${methodDefinition.name}"`
                            : `"${classDefinition.name}.${methodDefinition.name}", args:`,
                };

                methodView.parameters = methodDefinition.params.map((e) => {
                    return {
                        name:
                            (SWIFT_RESERVED_WORDS.includes(e.name) ? e.name + "_" : e.name) +
                            ": " +
                            this.getParamType(e.paramType),
                        last: false,
                    };
                });

                methodView.sendParameters = methodDefinition.params.map((e) => {
                    return {
                        name: SWIFT_RESERVED_WORDS.includes(e.name) ? e.name + "_" : e.name,
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

            const rawSdkClassName = `${classDefinition.name}.sdk.swift`;
            const sdkClassName = rawSdkClassName.charAt(0).toLowerCase() + rawSdkClassName.slice(1);

            generateSdkOutput.files.push({
                path: sdkClassName,
                data: Mustache.render(template, view),
                className: classDefinition.name,
            });
        }

        // generate remote.js
        generateSdkOutput.files.push({
            className: "Remote",
            path: "remote.swift",
            data: swiftSdk,
        });

        return generateSdkOutput;
    }

    getParamType(elem: Node): string {
        if (elem.type === AstNodeType.CustomNodeLiteral) {
            return "Any";
        } else if (elem.type === AstNodeType.StringLiteral) {
            return "String";
        } else if (elem.type === AstNodeType.IntegerLiteral) {
            return "Int";
        } else if (elem.type === AstNodeType.DoubleLiteral) {
            return "Double";
        } else if (elem.type === AstNodeType.FloatLiteral) {
            return "Float";
        } else if (elem.type === AstNodeType.BooleanLiteral) {
            return "Bool";
        } else if (elem.type === AstNodeType.AnyLiteral) {
            return "Any";
        } else if (elem.type === AstNodeType.ArrayType) {
            return `[${this.getParamType((elem as ArrayType).generic)}]`;
        } else if (elem.type === AstNodeType.PromiseType) {
            return `${this.getParamType((elem as PromiseType).generic)}`;
        }
        return "Any";
    }
}

const supportedLanguages = ["swift"];

export default { SdkGenerator, supportedLanguages };
