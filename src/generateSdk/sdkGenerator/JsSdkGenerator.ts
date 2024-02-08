import { TriggerType } from "../../models/yamlProjectConfiguration.js";
import {
    SdkGeneratorInterface,
    ClassDefinition,
    AstNodeType,
    SdkGeneratorInput,
    SdkGeneratorOutput,
    IndexModel,
} from "../../models/genezioModels.js";
import { nodeSdkJs } from "../templates/nodeSdkJs.js";
import Mustache from "mustache";

const indexTemplate = `/**
* This is an auto generated code. This code should not be modified since the file can be overwritten
* if new genezio commands are executed.
*/

{{#imports}}
import { {{#models}}{{{name}}}{{^last}}, {{/last}}{{/models}} } from "./{{{path}}}";
{{/imports}}

export { {{#exports}}{{{name}}}{{^last}}, {{/last}}{{/exports}} };
`;

const template = `/**
* This is an auto generated code. This code should not be modified since the file can be overwritten
* if new genezio commands are executed.
*/

import { Remote } from "./remote.js"

{{#hasGnzContext}}
export class LocalStorageWrapper implements Storage {
  setItem(key, value) {
    localStorage.setItem(key, value);
  }

  getItem(key) {
    return localStorage.getItem(key);
  }

  removeItem(key) {
    localStorage.removeItem(key);
  }

  clear() {
    localStorage.clear();
  }
}

export class StorageManager {
  private static storage = null;
  static getStorage(): Storage {
    if (!this.storage) {
      this.storage = new LocalStorageWrapper();
    }
    return this.storage;
  }
  static setStorage(storage) {
    this.storage = storage;
  }
}
{{/hasGnzContext}}

export class {{{className}}} {
  static remote = new Remote("{{{_url}}}")

  {{#methods}}
  {{#hasGnzContextAsFirstParameter}}
  static async {{{name}}}({{#parameters}}{{{name}}}{{^last}}, {{/last}}{{/parameters}}) {
    return {{{className}}}.remote.call({{{methodCaller}}} {"token": StorageManager.getStorage().getItem("apiToken")}, {{#parameters}}{{{name}}}{{^last}}, {{/last}}{{/parameters}})
  }
  {{/hasGnzContextAsFirstParameter}}
  {{^hasGnzContextAsFirstParameter}}
  static async {{{name}}}({{#parameters}}{{{name}}}{{^last}}, {{/last}}{{/parameters}}) {
    return {{{className}}}.remote.call({{{methodCaller}}}{{#parameters}}{{{name}}}{{^last}}, {{/last}}{{/parameters}})
  }
  {{/hasGnzContextAsFirstParameter}}

  {{/methods}}
}
`;

type MethodViewType = {
    name: string;
    parameters: {
        name: string;
        last: boolean;
    }[];
    methodCaller: string;
    hasGnzContextAsFirstParameter?: boolean;
};

type ViewType = {
    className: string;
    _url: string;
    methods: MethodViewType[];
    hasGnzContext?: boolean;
};

class SdkGenerator implements SdkGeneratorInterface {
    async generateSdk(sdkGeneratorInput: SdkGeneratorInput): Promise<SdkGeneratorOutput> {
        const generateSdkOutput: SdkGeneratorOutput = {
            files: [],
        };

        const indexModel: IndexModel = {
            imports: [],
            exports: [],
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

            const view: ViewType = {
                className: classDefinition.name,
                _url: _url,
                methods: [],
            };

            let exportClassChecker = false;

            for (const methodDefinition of classDefinition.methods) {
                const methodConfigurationType = classConfiguration.getMethodType(
                    methodDefinition.name,
                );

                if (
                    methodConfigurationType !== TriggerType.jsonrpc ||
                    classConfiguration.type !== TriggerType.jsonrpc
                ) {
                    continue;
                }

                exportClassChecker = true;

                const methodView: MethodViewType = {
                    name: methodDefinition.name,
                    parameters: [],
                    methodCaller:
                        methodDefinition.params.length === 0
                            ? `"${classDefinition.name}.${methodDefinition.name}"`
                            : `"${classDefinition.name}.${methodDefinition.name}", `,
                };

                methodView.parameters = methodDefinition.params
                    .map((e) => {
                        if (e.name === "gnzContext") {
                            methodView.hasGnzContextAsFirstParameter = true;
                            view.hasGnzContext = true;
                            return undefined;
                        }

                        return {
                            name: e.name,
                            last: false,
                        };
                    })
                    .filter((e) => e !== undefined) as { name: string; last: boolean }[];

                if (methodView.parameters.length > 0) {
                    methodView.parameters[methodView.parameters.length - 1].last = true;
                }

                view.methods.push(methodView);
            }

            if (!exportClassChecker) {
                continue;
            }

            this.addClassToIndex(indexModel, classDefinition.name);

            const rawSdkClassName = `${classDefinition.name}.sdk.js`;
            const sdkClassName = rawSdkClassName.charAt(0).toLowerCase() + rawSdkClassName.slice(1);

            generateSdkOutput.files.push({
                path: sdkClassName,
                data: Mustache.render(template, view),
                className: classDefinition.name,
            });
        }

        // generate remote.js
        generateSdkOutput.files.push({
            className: "Remote",
            path: "remote.js",
            data: nodeSdkJs.replace("%%%url%%%", "undefined"),
        });

        // generate index.js
        if (indexModel.exports.length > 0) {
            indexModel.exports[indexModel.exports.length - 1].last = true;
        }
        generateSdkOutput.files.push({
            className: "index",
            path: "index.js",
            data: Mustache.render(indexTemplate, indexModel),
        });

        return generateSdkOutput;
    }

    addClassToIndex(indexModel: IndexModel, className: string) {
        const rawPath = `${className}.sdk`;
        const path = rawPath.charAt(0).toLowerCase() + rawPath.slice(1);
        indexModel.imports.push({
            path: path,
            models: [
                {
                    name: className,
                    last: true,
                },
            ],
        });
        indexModel.exports.push({
            name: className,
            last: false,
        });
    }
}

const supportedLanguages = ["js"];

export default { SdkGenerator, supportedLanguages };
