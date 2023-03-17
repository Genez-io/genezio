import {
  AstNodeType,
  ClassDefinition,
  NativeType,
  NativeTypeEnum,
  ParameterDefinition,
  TypeAlias,
  TypeDefinition
} from "../astGenerator/astGenerator.interface";
import { TriggerType } from "../models/yamlProjectConfiguration.model";
import {
  GenerateSdkInput,
  SdkClassFile,
  SdkGeneratorInterface
} from "./sdkGenerator.interface";

export class SwiftSdkGenerator implements SdkGeneratorInterface {
  externalTypes: TypeDefinition[] = [];
  classImplementation = "";

  async generateClassSdk(
    sdkGeneratorInfo: GenerateSdkInput
  ): Promise<SdkClassFile | undefined> {
    const _url = "%%%link_to_be_replace%%%";
    const classConfiguration = sdkGeneratorInfo.classConfiguration;
    const methodsMap = sdkGeneratorInfo.methodsMap;

    let classDefinition: ClassDefinition | undefined = undefined;

    if (sdkGeneratorInfo.program.body === undefined) {
      return undefined;
    }
    for (const elem of sdkGeneratorInfo.program.body) {
      if (elem.type === AstNodeType.ClassDefinition) {
        classDefinition = elem;
      }
    }

    if (classDefinition === undefined) {
      return undefined;
    }
    this.classImplementation = `/**
* This is an auto generated code. This code should not be modified since the file can be overwriten 
* if new genezio commands are executed.
*/
   
import Foundation

%%%type%%%

class ${classDefinition.name} {
    public static let remote = Remote(url: "${_url}")
    
    %%%func%%%
}`;

    let exportClassChecker = false;

    for (const methodDefinition of classDefinition.methods) {
      let func;
      const methodConfiguration = methodsMap[methodDefinition.name];

      if (
        methodConfiguration &&
        methodConfiguration.type !== TriggerType.jsonrpc
      ) {
        continue;
      }

      if (classConfiguration.type !== TriggerType.jsonrpc) {
        continue;
      }

      exportClassChecker = true;

      if (methodDefinition.params.length === 0) {
        func = `static func ${methodDefinition.name}(${methodDefinition.params
          .map(
            (e: ParameterDefinition) =>
              e.name + ": " + this.getParamType(e.paramType)
          )
          .join(", ")}) async -> ${this.getParamType(
          methodDefinition.returnType
        )} {
        return await ${classDefinition.name}.remote.call(method: "${
          classDefinition.name
        }.${methodDefinition.name}")  
      }

  %%%func%%%`;
      } else {
        func = `static func ${methodDefinition.name}(${methodDefinition.params
          .map(
            (e: ParameterDefinition) =>
              e.name +
              ": " +
              this.getParamType(e.paramType) +
              (e.defaultValue
                ? " = " +
                  ((typeof e.defaultValue === "string" ? '"' : "") +
                    e.defaultValue.toString()) +
                  (typeof e.defaultValue === "string" ? '"' : "")
                : "")
          )
          .join(", ")}) async -> ${this.getParamType(
          methodDefinition.returnType
        )} {
          return await ${classDefinition.name}.remote.call(method: "${
          classDefinition.name
        }.${methodDefinition.name}", args: ${methodDefinition.params
          .map((e) => e.name)
          .join(", ")})  
      }

  %%%func%%%`;
      }
      this.classImplementation = this.classImplementation.replace(
        "%%%func%%%",
        func
      );
    }

    this.classImplementation = this.classImplementation
      .replace("%%%func%%%", "")
      .replace("%%%type%%%", "");

    if (!exportClassChecker) {
      return undefined;
    }

    return {
      filename: sdkGeneratorInfo.fileName,
      name: classDefinition.name,
      implementation: this.classImplementation
    };
  }

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

    this.classImplementation = this.classImplementation.replace(
      "%%%type%%%",
      externalType
    );
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
      const localElem: TypeAlias = elem as TypeAlias;
      //this.generateExternalTypes(localElem);

      //return localElem.name;
    }

    return "Any";
  }
}
