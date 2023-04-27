
import { TriggerType } from "../../models/yamlProjectConfiguration";
import {
  SdkGeneratorInterface,
  ClassDefinition,
  AstNodeType,
  SdkGeneratorInput,
  SdkGeneratorOutput
} from "../../models/genezioModels";
import { nodeSdkJs } from "../templates/nodeSdkJs";
import Mustache from "mustache";


const template = `/**
* This is an auto generated code. This code should not be modified since the file can be overwriten
* if new genezio commands are executed.
*/

import { Remote } from "./remote.js"

export class {{{className}}} {
  static remote = new Remote("{{{_url}}}")

  {{#methods}}
  static async {{{name}}}({{#parameters}}{{{name}}}{{^last}}, {{/last}}{{/parameters}}) {
    return {{{className}}}.remote.call({{{methodCaller}}}{{#parameters}}{{{name}}}{{^last}}, {{/last}}{{/parameters}})
  }

  {{/methods}}
}
`;

class SdkGenerator implements SdkGeneratorInterface {
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
            : `"${classDefinition.name}.${methodDefinition.name}", `
        };

        methodView.parameters = methodDefinition.params.map((e) => {
          return {
            name: e.name,
            last: false
          }
        });

        if (methodView.parameters.length > 0) {
          methodView.parameters[methodView.parameters.length - 1].last = true;
        }

        view.methods.push(methodView);
      }

      if (!exportClassChecker) {
        continue;
      }

      const rawSdkClassName = `${classDefinition.name}.sdk.js`;
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
      path: "remote.js",
      data: nodeSdkJs.replace("%%%url%%%", "undefined")
    });

    return generateSdkOutput;
  }
}

const supportedLanguages = ["js"];


export default { SdkGenerator, supportedLanguages }
