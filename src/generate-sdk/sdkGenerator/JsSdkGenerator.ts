import { runtime } from "webpack";
import { TriggerType } from "../../models/generateSdkResponse";
import {
  SdkGeneratorInterface,
  ClassDefinition,
  AstNodeType,
  SdkGeneratorInput,
  SdkGeneratorOutput
} from "../../models/genezio-models";
import { browserSdkJs } from "../templates/browserSdkJs";
import { nodeSdkJs } from "../templates/nodeSdkJs";


export class JsSdkGenerator implements SdkGeneratorInterface {
  async generateSdk(
    sdkGeneratorInput: SdkGeneratorInput
  ): Promise<SdkGeneratorOutput> {
    const options = sdkGeneratorInput.sdk.options;
    const nodeRuntime = options.runtime;

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
      let classImplementation = `/**
* This is an auto generated code. This code should not be modified since the file can be overwriten 
* if new genezio commands are executed.
*/
  
import { Remote } from "./remote.js"

export class ${classDefinition.name} {
    static remote = new Remote("${_url}")

    %%%func%%%
}

export { Remote };
  `;

      let exportClassChecker = false;

      for (const methodDefinition of classDefinition.methods) {
        let func;
        const methodConfigurationType = classConfiguration.getMethodType(methodDefinition.name);

        if (
          methodConfigurationType !== TriggerType.jsonrpc
        ) {
          continue;
        }

        if (classConfiguration.type !== TriggerType.jsonrpc) {
          continue;
        }

        exportClassChecker = true;

        if (methodDefinition.params.length === 0) {
          func = `static async ${methodDefinition.name}(${methodDefinition.params
            .map((e) => e.name)
            .join(", ")}) {
            return ${classDefinition.name}.remote.call("${classDefinition.name}.${
            methodDefinition.name
          }")  
        }
        
        %%%func%%%`;
        } else {
          func = `static async ${methodDefinition.name}(${methodDefinition.params
            .map(
              (e) =>
                e.name +
                (e.defaultValue
                  ? " = " +
                    ((typeof e.defaultValue === "string" ? '"' : "") +
                      e.defaultValue.toString()) +
                    (typeof e.defaultValue === "string" ? '"' : "")
                  : "")
            )
            .join(", ")}) {
            return ${classDefinition.name}.remote.call("${classDefinition.name}.${
            methodDefinition.name
          }", ${methodDefinition.params.map((e) => e.name).join(", ")})  
        }
    
        %%%func%%%`;
        }
        classImplementation = classImplementation.replace("%%%func%%%", func);
      }

      classImplementation = classImplementation.replace("%%%func%%%", "");

      if (!exportClassChecker) {
        continue;
      }

      generateSdkOutput.files.push({
        path: classInfo.fileName,
        data: classImplementation
      });
    }

    // generate remote.js
    generateSdkOutput.files.push({
      path: "remote.js",
      data: nodeRuntime === "node" ? nodeSdkJs.replace("%%%url%%%", "undefined")
      : browserSdkJs.replace("%%%url%%%", "undefined")
    });

    return generateSdkOutput;
  }
}
