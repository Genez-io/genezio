import Mustache from "mustache";
import { 
    AstNodeType,
    ClassDefinition,
    SdkGeneratorInput,
    SdkGeneratorInterface,
    SdkGeneratorOutput,
    TypeAlias,
    StringType,
    IntegerType,
    DoubleType,
    BooleanType,
    Node,
    AnyType,
    FloatType,
    CustomAstNodeType
} from "../../models/genezioModels";
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
    externalTypes: Node[] = [];

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
                  classDefinition = elem as ClassDefinition;
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

    getParamType(elem: Node): string {
        if (elem.type === AstNodeType.CustomNodeLiteral) {
            return (elem as CustomAstNodeType).rawValue;
        } else if (elem.type === AstNodeType.StringLiteral) {
          return "String";
        } else if (elem.type === AstNodeType.IntegerLiteral) {
          return "int";
        } else if (elem.type === AstNodeType.DoubleLiteral) {
          return "double";
        } else if (elem.type === AstNodeType.BooleanLiteral) {
          return "bool";
        } else if (elem.type === AstNodeType.AnyLiteral) {
          return "Object";
        }
        return "Object";
    }

    // TODO: create types for all external types
    async generateExternalTypes(type: Node) {
        // check if type is already in externalTypes
        if (
            this.externalTypes.find((e: Node) => {
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
