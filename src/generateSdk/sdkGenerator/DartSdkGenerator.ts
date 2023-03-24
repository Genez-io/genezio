import Mustache from "mustache";
import { AstNodeType, ClassDefinition, NativeType, NativeTypeEnum, SdkGeneratorInput, SdkGeneratorInterface, SdkGeneratorOutput, TypeAlias, TypeDefinition } from "../../models/genezioModels";
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

const template = `/**
* This is an auto generated code. This code should not be modified since the file can be overwriten
* if new genezio commands are executed.
*/

import 'remote.dart';

class {{{className}}} {
  static final remote = Remote("{{{_url}}}");

  {{#methods}}
  static Future<dynamic> {{{name}}}({{#parameters}}{{{name}}}{{^last}}, {{/last}}{{/parameters}}) async {
    return remote.call({{{methodCaller}}}, [{{#sendParameters}}{{{name}}}{{^last}}, {{/last}}{{/sendParameters}}]);
  }

  {{/methods}}
}
`;

class SdkGenerator implements SdkGeneratorInterface {
    externalTypes: TypeDefinition[] = [];

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
            for (const elem of classInfo.program.body) {
                if (elem.type === AstNodeType.ClassDefinition) {
                  classDefinition = elem;
                }
            }

            if (classDefinition === undefined) {
                continue;
            }

            const view: any = {
            className: classDefinition.name,
            _url: _url,
            methods: []
        };

        let exportClassChecker = false;

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

    getParamType(elem: TypeDefinition): string {
        if (elem.type === AstNodeType.NativeType) {
          const localElem: NativeType = elem as NativeType;
          switch (localElem.paramType) {
            case NativeTypeEnum.string:
              return "String";
            case NativeTypeEnum.number:
              return "double";
            case NativeTypeEnum.boolean:
              return "bool";
            case NativeTypeEnum.any:
              return "Object";
            default:
              return "Object";
          }
        } else if (elem.type === AstNodeType.TypeAlias) {
          // TODO: create types for all external types
          const localElem: TypeAlias = elem as TypeAlias;
        }

        return "Object";
    }

    // TODO: create types for all external types
    async generateExternalTypes(type: TypeDefinition) {
        // check if type is already in externalTypes
        if (
            this.externalTypes.find((e: TypeDefinition) => {
            if (e.type === AstNodeType.TypeAlias) {
                return (e as TypeAlias).name === (type as TypeAlias).name;
            }
            return false;
            })
        ) {
            return;
        }

        this.externalTypes.push(type);
        const externalType = "";
        if (type.type === AstNodeType.TypeAlias) {
            const localType: TypeAlias = type as TypeAlias;
        }
    }
}

const supportedLanguages = ["dart"];

export default { SdkGenerator, supportedLanguages }
