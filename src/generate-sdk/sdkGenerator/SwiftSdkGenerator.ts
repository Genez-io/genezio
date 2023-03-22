import Mustache from "mustache";
import { ClassDefinition, AstNodeType, SdkGeneratorInterface, SdkGeneratorInput, SdkGeneratorOutput, NativeType, NativeTypeEnum, TypeAlias, TypeDefinition } from "../../models/genezioModels";
import { TriggerType } from "../../models/yamlProjectConfiguration";
import { swiftSdk } from "../templates/swiftSdk";

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
  "willSet"
];

// example of view
// const view = {
//   "className": "HelloWorldService",
//   "_url": "http://localhost:8080",
//   "methods": [{
//       "name": "hello",
//       "parameters": [{
//         "name": "name",
//       },
//       "sendParameters": [{
//         "name": "name",
//       },
//     {
//       "name": "age",
//       last: true
//     }],
//       "methodCaller": '"Task.deleteTask", args:'
//   }]
// }

const template = `/**
* This is an auto generated code. This code should not be modified since the file can be overwriten 
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
          returnType: this.getParamType(methodDefinition.returnType),
          methodCaller: methodDefinition.params.length === 0 ?
            `"${classDefinition.name}.${methodDefinition.name}"`
            : `"${classDefinition.name}.${methodDefinition.name}", args:`
        };

        methodView.parameters = methodDefinition.params.map((e) => {
          return {
            name: (SWIFT_RESERVED_WORDS.includes(e.name) ? e.name + "_" : e.name) + ": " + this.getParamType(e.paramType),
            last: false
          }
        });

        methodView.sendParameters = methodDefinition.params.map((e) => {
          return {
            name: (SWIFT_RESERVED_WORDS.includes(e.name) ? e.name + "_" : e.name),
            last: false
          }
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
      path: "remote.swift",
      data: swiftSdk
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
          return "Double";
        case NativeTypeEnum.boolean:
          return "Bool";
        case NativeTypeEnum.any:
          return "Any";
        default:
          return "Any";
      }
    } else if (elem.type === AstNodeType.TypeAlias) {
      // TODO
      const localElem: TypeAlias = elem as TypeAlias;
    }

    return "Any";
  }


  // TOOD
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
      //       externalType = `struct ${localType.name} = {
      // ${localType.params
      //   .map((e: TypeDefinition) => e.name + ": " + this.getParamType(e))
      //   .join("\n")}
      // }`;
    }

    // return externalType;
  }
}

const supportedLanguages = ["swift"];


export default { SdkGenerator, supportedLanguages }