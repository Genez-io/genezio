import { ClassDefinition, AstNodeType } from "../../models/genezio-models";
import { TriggerType } from "../models/yamlProjectConfiguration.model";
import {
  GenerateSdkInput,
  SdkClassFile,
  SdkGeneratorInterface
} from "./sdkGenerator.interface";

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

export class PythonSdkGenerator implements SdkGeneratorInterface {
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
    let classImplementation = `# This is an auto generated code. This code should not be modified since the file can be overwriten 
# if new genezio commands are executed.
   
from .remote import Remote

class ${classDefinition.name}:
    remote = Remote("${_url}")

    %%%func%%%

`;

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
      const paramsString = methodDefinition.params.map((e) => {
        if (PYTHON_RESERVED_WORDS.includes(e.name)) {
          return e.name + "_";
        }
        return e.name;
      }
      ).join(", ");

      if (methodDefinition.params.length === 0) {
        func = `def ${methodDefinition.name}(${paramsString}):
        return ${classDefinition.name}.remote.call("${classDefinition.name}.${
          methodDefinition.name
        }")  
      
    %%%func%%%`;
      } else {
        func = `def ${methodDefinition.name}(${paramsString}):
        return ${classDefinition.name}.remote.call("${classDefinition.name}.${
          methodDefinition.name
        }", ${paramsString})  
  
    %%%func%%%`;
      }
      classImplementation = classImplementation.replace("%%%func%%%", func);
    }

    classImplementation = classImplementation.replace("%%%func%%%", "");

    if (!exportClassChecker) {
      return undefined;
    }

    return {
      filename: sdkGeneratorInfo.fileName,
      name: classDefinition.name,
      implementation: classImplementation
    };
  }
}
