import Mustache from "mustache";
import { ClassDefinition, AstNodeType, SdkGeneratorInterface, SdkGeneratorInput, SdkGeneratorOutput } from "../../models/genezio-models";
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
//       "methodCaller": '"Task.deleteTask", '
//   }]
// }

const template = `# This is an auto generated code. This code should not be modified since the file can be overwriten 
# if new genezio commands are executed.
  
from .remote import Remote

class {{{className}}}:
  remote = Remote("{{{_url}}}")

  {{#methods}}
  def {{{name}}}({{#parameters}}{{{name}}}{{^last}}, {{/last}}{{/parameters}}):
    return {{{className}}}.remote.call({{{methodCaller}}}{{#sendParameters}}{{{name}}}{{^last}}, {{/last}}{{/sendParameters}})

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
          methodCaller: methodDefinition.params.length === 0 ?
            `"${classDefinition.name}.${methodDefinition.name}"`
            : `"${classDefinition.name}.${methodDefinition.name}", `
        };

        methodView.parameters = methodDefinition.params.map((e) => {
          return {
            name: PYTHON_RESERVED_WORDS.includes(e.name) ? e.name + "_" : e.name,
            last: false
          }
        });

        if (methodView.parameters.length > 0) {
          methodView.parameters[methodView.parameters.length - 1].last = true;
        }

        methodView.sendParameters = [...methodView.parameters];

        methodView.parameters.unshift({
          name: "self",
          last: false
        })

        view.methods.push(methodView);
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
}

const supportedLanguages = ["py", "python"];


export default { SdkGenerator, supportedLanguages }