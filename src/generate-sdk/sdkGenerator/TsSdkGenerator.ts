
import { AstNodeType, ClassDefinition, MethodDefinition, NativeType, ParameterDefinition, TypeAlias, TypeDefinition } from "../../models/genezio-models";
import {
  GenerateSdkInput,
  SdkClassFile,
  SdkGeneratorInterface
} from "./sdkGenerator.interface";

export class TsSdkGenerator implements SdkGeneratorInterface {
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
     
import { Remote } from "./remote"

%%%type%%%

export class ${classDefinition.name} {
    static remote = new Remote("${_url}")

    %%%func%%%

}

export { Remote };
`;

    let exportClassChecker = false;

    if (classDefinition.typeDefinitions) {
      for (const type of classDefinition.typeDefinitions) {
        let externalType = "";
        externalType = `${type.definition};

%%%type%%%`;

        this.classImplementation = this.classImplementation.replace(
          "%%%type%%%",
          externalType
        );
      }
    }

    for (const methodDefinition of classDefinition.methods) {
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
      const func = this.getMethodImplementation(classDefinition, methodDefinition);

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

    let externalType = "";
    if (type.type === AstNodeType.TypeAlias) {
      const localType: TypeAlias = type as TypeAlias;
      externalType = `${localType.definition};

%%%type%%%`;
    }

    this.classImplementation = this.classImplementation.replace(
      "%%%type%%%",
      externalType
    );
  }

  getMethodImplementation(
    classDefinition: ClassDefinition,
    methodDefinition: MethodDefinition
  ): string {
    let func;

    if (methodDefinition.params.length === 0) {
      const parameters = methodDefinition.params
        .map(
          (e: ParameterDefinition) =>
            e.name + ": " + this.getParamType(e.paramType)
        )
        .join(", ");
      const returnType = this.getReturnType(methodDefinition.returnType);
      func = `static async ${methodDefinition.name}(${parameters})${returnType} {
        return await ${classDefinition.name}.remote.call("${classDefinition.name}.${methodDefinition.name}")  
  }

  %%%func%%%`;
    } else {
      const parameters = methodDefinition.params
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
        .join(", ");
      const returnType = this.getReturnType(methodDefinition.returnType);

      func = `static async ${
        methodDefinition.name
      }(${parameters})${returnType} {
        return await ${classDefinition.name}.remote.call("${
        classDefinition.name
      }.${methodDefinition.name}", ${methodDefinition.params
        .map((e) => e.name)
        .join(", ")})  
  }

  %%%func%%%`;
    }

    return func;
  }

  getReturnType(returnType: TypeDefinition | undefined): string {
    if (!returnType) {
      return "";
    }

    let value = this.getParamType(returnType);
    if (!value.includes("Promise")) {
      value = `Promise<${value}>`;
    }

    return `: ${value}`;
  }

  getParamType(elem: TypeDefinition): string {
    if (elem.type === AstNodeType.NativeType) {
      const localElem: NativeType = elem as NativeType;
      return localElem.paramType;
      // switch (localElem.paramType) {
      //   case NativeTypeEnum.string:
      //     return "String";
      //   case NativeTypeEnum.number:
      //     return "Double";
      //   case NativeTypeEnum.boolean:
      //     return "Bool";
      //   case NativeTypeEnum.any:
      //     return "Any";
      //   default:
      //     return "Any";
      // }
    } else if (elem.type === AstNodeType.TypeAlias) {
      const localElem: TypeAlias = elem as TypeAlias;
      // this.generateExternalTypes(localElem);

      return localElem.name;
    }

    return "any";
  }
}
