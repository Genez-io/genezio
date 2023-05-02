import Mustache from "mustache";
import { 
  ClassDefinition,
  AstNodeType,
  SdkGeneratorInterface,
  SdkGeneratorInput,
  SdkGeneratorOutput,
  TypeAlias,
  Node,
  UnionType,
  CustomAstNodeType,
  ArrayType,
  PropertyDefinition,
  Enum,
  StructLiteral,
  PromiseType,
  EnumCase,
  EnumType
} from "../../models/genezioModels";
import { TriggerType } from "../../models/yamlProjectConfiguration";
import { pythonSdk } from "../templates/pythonSdk";


const PYTHON_RESERVED_WORDS = [
  "False",
  "class",
  "from",
  "or",
  "None",
  "continue",
  "global",
  "pass",
  "True",
  "def",
  "if",
  "raise",
  "and",
  "del",
  "import",
  "return",
  "as",
  "elif",
  "in",
  "try",
  "assert",
  "else",
  "is",
  "while",
  "async",
  "except",
  "lambda",
  "with",
  "await",
  "finally",
  "nonlocal",
  "yield",
  "break",
  "for",
  "not"
];

const template = `# This is an auto generated code. This code should not be modified since the file can be overwriten 
# if new genezio commands are executed.
  
from .remote import Remote
from typing import Any, List
from enum import IntEnum, StrEnum
from collections.abc import Mapping

{{#externalTypes}}
{{{type}}}
{{/externalTypes}}

class {{{className}}}:
  remote = Remote("{{{_url}}}")

  {{#methods}}
  def {{{name}}}({{#parameters}}{{{name}}}{{^last}}, {{/last}}{{/parameters}}) -> {{{returnType}}}:
    return {{#mapToObject}}{{{returnType}}}(**({{/mapToObject}}{{{className}}}.remote.call({{{methodCaller}}}{{#sendParameters}}{{{name}}}{{^last}}, {{/last}}{{/sendParameters}}){{#mapToObject}})){{/mapToObject}}

  {{/methods}}
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
          returnType: this.getParamType(methodDefinition.returnType),
          mapToObject: this.isMapToObject(methodDefinition.returnType),
          methodCaller: methodDefinition.params.length === 0 ?
            `"${classDefinition.name}.${methodDefinition.name}"`
            : `"${classDefinition.name}.${methodDefinition.name}", `
        };

        methodView.parameters = methodDefinition.params.map((e) => {
          return {
            name: (PYTHON_RESERVED_WORDS.includes(e.name) ? e.name + "_" : e.name) + ": " + this.getParamType(e.paramType) + (e.optional ? " = None" : (e.defaultValue ? " = " + (e.defaultValue.type === AstNodeType.StringLiteral ? "'" + e.defaultValue.value + "'" : e.defaultValue.value) : "")),
            last: false
          }
        });

        methodView.sendParameters = methodDefinition.params.map((e) => {
          return {
            name: (PYTHON_RESERVED_WORDS.includes(e.name) ? e.name + "_" : e.name),
            last: false
          }
        });

        if (methodView.parameters.length > 0) {
          methodView.parameters[methodView.parameters.length - 1].last = true;
          methodView.sendParameters[methodView.sendParameters.length - 1].last = true;
        }

        methodView.parameters.unshift({
          name: "self",
          last: false
        })


        if (methodView.parameters.length == 1) {
          methodView.parameters[methodView.parameters.length - 1].last = true;
        }

        view.methods.push(methodView);
      }

      for (const externalType of externalTypes) {
        view.externalTypes.push({type: this.generateExternalType(externalType)});
      }

      if (!exportClassChecker) {
        continue;
      }

      const rawSdkClassName = `${classDefinition.name}.py`;
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
      path: "remote.py",
      data: pythonSdk
    });

    return generateSdkOutput;
  }

  getParamType(elem: Node): string {
    if (elem.type === AstNodeType.CustomNodeLiteral) {
      const customAstNodeType = elem as CustomAstNodeType;
      if (customAstNodeType.rawValue === "Date") {
        return "Any";
      }
      return customAstNodeType.rawValue;
    } else if (elem.type === AstNodeType.StringLiteral) {
      return "str";
    } else if (elem.type === AstNodeType.IntegerLiteral) {
      return "int";
    } else if (elem.type === AstNodeType.FloatLiteral || elem.type === AstNodeType.DoubleLiteral) {
      return "float";
    } else if (elem.type === AstNodeType.BooleanLiteral) {
      return "bool";
    } else if (elem.type === AstNodeType.Enum) {
      return (elem as EnumType).name;
    } else if (elem.type === AstNodeType.AnyLiteral) {
      return "Any";
    } else if (elem.type === AstNodeType.ArrayType) {
      return `List[${this.getParamType((elem as ArrayType).generic)}]`;
    } else if (elem.type === AstNodeType.PromiseType) {
      return `${this.getParamType((elem as PromiseType).generic)}`;
    } else if (elem.type === AstNodeType.TypeAlias) {
      return (elem as TypeAlias).name;
    } else if (elem.type === AstNodeType.UnionType) {
      return (elem as UnionType).params
        .map((e: Node) => this.getParamType(e))
        .join(" | ")
    }
    return "Any";
  }

  generateEnum(e: Enum): string {
    const enumType = e.cases[0].type;
    const allTypesAreTheSame = e.cases.map((v) => v.type).every((type) => type === enumType);

    if (!allTypesAreTheSame) {
      throw new Error("All enum cases must be the same type. Fix enum " + e.name + " and try again.");
    }

    switch (enumType) {
      case AstNodeType.StringLiteral:
        return `class ${e.name}(StrEnum):\n\t${e.cases.map((e: EnumCase, i: number) => `${e.name} = "${e.value}"`).join("\n\t")}`;
      case AstNodeType.DoubleLiteral:
        return `class ${e.name}(IntEnum):\n\t${e.cases.map((e: EnumCase, i: number) => `${e.name} = ${e.value}`).join("\n\t")}`;
      default:
        throw new Error("Unsupported enum type");
    }
  }

  generateExternalType(type: Node): string {
    if (type.type === AstNodeType.TypeAlias) {
      const typeAlias = type as TypeAlias;
      return `${typeAlias.name} = ${this.getParamType(typeAlias.aliasType)};`;
    } else if (type.type === AstNodeType.Enum) {
      const enumType = type as Enum;
      return this.generateEnum(enumType);
    } else if (type.type === AstNodeType.StructLiteral) {
      const typeAlias = type as StructLiteral;
      typeAlias.typeLiteral.properties.sort((a: PropertyDefinition, b: PropertyDefinition) => a.optional === b.optional ? 0 : a.optional ? 1 : -1);
      return `class ${typeAlias.name}:\n\tdef __init__(self, ${typeAlias.typeLiteral.properties.map((e: PropertyDefinition) => `${e.name}: ${this.getParamType(e.type)}${e.optional ? ' = None' : ''}`).join(", ")}):\n\t\t` // header
        + `${typeAlias.typeLiteral.properties.map((e: PropertyDefinition) => `${e.optional ? `if ${e.name} is not None:\n\t\t\t` : ''}${e.type.type === AstNodeType.CustomNodeLiteral ? `if isinstance(${e.name}, Mapping):\n\t\t\t${e.optional ? '\t' : ''}self.${e.name} = ${this.getParamType(e.type)}(**${e.name})\n\t\t${e.optional ? '\t' : ''}else:\n\t\t\t${e.optional ? '\t' : ''}self.${e.name} = ${e.name}` : `self.${e.name} = ${e.name}`}`).join("\n\t\t")}`;
    }
    return "";
  }

  isMapToObject(type: Node): boolean {
    if (type.type === AstNodeType.CustomNodeLiteral) {
      const customAstNodeType = type as CustomAstNodeType;
      if (customAstNodeType.rawValue === "Date") {
        return false;
      }
      return true;
    }
    if (type.type === AstNodeType.PromiseType) {
      return this.isMapToObject((type as PromiseType).generic);
    }
    return false;
  }
}

const supportedLanguages = ["py", "python"];


export default { SdkGenerator, supportedLanguages }