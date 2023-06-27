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
  PromiseType
 } from "../../models/genezioModels.js";
import { TriggerType } from "../../models/yamlProjectConfiguration.js";
import { nodeSdkTs } from "../templates/nodeSdkTs.js";

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
  "of"
];

const template = `/**
* This is an auto generated code. This code should not be modified since the file can be overwriten
* if new genezio commands are executed.
*/

import { Remote } from "./remote";

{{#externalTypes}}
export {{{type}}}
{{/externalTypes}}

export class {{{className}}} {
  static remote = new Remote("{{{_url}}}");

  {{#methods}}
  static async {{{name}}}({{#parameters}}{{{name}}}{{^last}}, {{/last}}{{/parameters}}){{{returnType}}} {
    return await {{{className}}}.remote.call({{{methodCaller}}}{{#sendParameters}}{{{name}}}{{^last}}, {{/last}}{{/sendParameters}});
  }
  {{/methods}}
}

export { Remote };
`;


class SdkGenerator implements SdkGeneratorInterface {
  async generateSdk(
    sdkGeneratorInput: SdkGeneratorInput
  ): Promise<SdkGeneratorOutput> {
    const generateSdkOutput: SdkGeneratorOutput = {
      files: []
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

      const view: any = {
        className: classDefinition.name,
        _url: _url,
        methods: [],
        externalTypes: []
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
          returnType: this.getReturnType(methodDefinition.returnType),
          methodCaller: methodDefinition.params.length === 0 ?
            `"${classDefinition.name}.${methodDefinition.name}"`
            : `"${classDefinition.name}.${methodDefinition.name}", `
        };

        methodView.parameters = methodDefinition.params.map((e) => {
          return {
            name: (TYPESCRIPT_RESERVED_WORDS.includes(e.name) ? e.name + "_" : e.name) + (e.optional ? "?" : "") + ": " + this.getParamType(e.paramType) + (e.defaultValue ? " = " + (e.defaultValue.type === AstNodeType.StringLiteral ? "'" + e.defaultValue.value + "'" : e.defaultValue.value) : ""),
            last: false
          }
        });

        methodView.sendParameters = methodDefinition.params.map((e) => {
          return {
            name: (TYPESCRIPT_RESERVED_WORDS.includes(e.name) ? e.name + "_" : e.name),
            last: false
          }
        });

        if (methodView.parameters.length > 0) {
          methodView.parameters[methodView.parameters.length - 1].last = true;
          methodView.sendParameters[methodView.sendParameters.length - 1].last = true;
        }

        view.methods.push(methodView);
      }

      for (const externalType of externalTypes) {
        view.externalTypes.push({type: this.generateExternalType(externalType)});
      }

      if (!exportClassChecker) {
        continue;
      }

      const rawSdkClassName = `${classDefinition.name}.sdk.ts`;
      const sdkClassName = rawSdkClassName.charAt(0).toLowerCase() + rawSdkClassName.slice(1)

      generateSdkOutput.files.push({
        path: sdkClassName,
        data: Mustache.render(template, view),
        className: classDefinition.name
      });
    }

    // generate remote.js
    generateSdkOutput.files.push({
      className: "Remote",
      path: "remote.ts",
      data: nodeSdkTs.replace("%%%url%%%", "undefined")
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
    } else if (elem.type === AstNodeType.IntegerLiteral || elem.type === AstNodeType.FloatLiteral || elem.type === AstNodeType.DoubleLiteral) {
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
      return (elem as UnionType).params
        .map((e: Node) => this.getParamType(e))
        .join(" | ");
    } else if (elem.type === AstNodeType.TypeLiteral) {
      return `{${(elem as TypeLiteral).properties.map((e: PropertyDefinition) => `${e.name}${e.optional ? '?' : ''}: ${this.getParamType(e.type)}`).join(", ")}}`;
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
      return `enum ${enumType.name} {${enumType.cases.map((c) => {
        if (c.type === AstNodeType.StringLiteral) {
          return `${c.name} = "${c.value}"`;
        } else if (c.type === AstNodeType.DoubleLiteral) {
          if (c.value !== undefined && c.value !== null) {
            return `${c.name} = ${c.value}`;
          } else {
            return `${c.name}`;
          }
        }
      }).join(", ")}}`;
    } else if (type.type === AstNodeType.StructLiteral) {
      const typeAlias = type as StructLiteral;
      return `type ${typeAlias.name} = ${this.getParamType(typeAlias.typeLiteral)};`;
    }
    return "";
  }
}


const supportedLanguages = ["ts", "typescript"];


export default { SdkGenerator, supportedLanguages }