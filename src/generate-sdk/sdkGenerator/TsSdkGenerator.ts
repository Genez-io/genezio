
import { AstNodeType, ClassDefinition, MethodDefinition, NativeType, ParameterDefinition, SdkGeneratorInput, SdkGeneratorInterface, SdkGeneratorOutput, TypeAlias, TypeDefinition } from "../../models/genezioModels";
import { TriggerType } from "../../models/yamlProjectConfiguration";
import { browserSdkTs } from "../templates/browserSdkTs";
import { nodeSdkTs } from "../templates/nodeSdkTs";


class SdkGenerator implements SdkGeneratorInterface {
    externalTypes: TypeDefinition[] = [];
    classImplementation = "";

  async generateSdk(
      sdkGeneratorInput: SdkGeneratorInput
    ): Promise<SdkGeneratorOutput> {
  const options = sdkGeneratorInput.sdk.options;
  const nodeRuntime = options.runtime;
  const generateSdkOutput: SdkGeneratorOutput = {
    files: []
  };
  for (const classInfo of sdkGeneratorInput.classesInfo) {
    this.externalTypes = [];
    this.classImplementation = "";  
    const _url = "%%%link_to_be_replace%%%";
    const classConfiguration = classInfo.classConfiguration

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
      const methodConfiguration = classInfo.classConfiguration.getMethodType(methodDefinition.name);

      if (
        methodConfiguration !== TriggerType.jsonrpc
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
      continue;
    }

    const rawSdkClassName = `${classDefinition.name}.sdk.ts`;
    const sdkClassName = rawSdkClassName.charAt(0).toLowerCase() + rawSdkClassName.slice(1)

    generateSdkOutput.files.push({
      path: sdkClassName,
      data: this.classImplementation,
      className: classDefinition.name
    });
  }

    // generate remote.js
    generateSdkOutput.files.push({
      className: "Remote",
      path: "remote.ts",
      data: nodeRuntime === "node" ? nodeSdkTs.replace("%%%url%%%", "undefined")
      : browserSdkTs.replace("%%%url%%%", "undefined")
    });

    return generateSdkOutput;
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


const supportedLanguages = ["ts", "typescript"];


export default { SdkGenerator, supportedLanguages }