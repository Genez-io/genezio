import path from "path";
import { createRequire } from 'module';
import {
    TriggerType,
    YamlClassConfiguration,
  YamlLocalConfiguration,
  YamlProjectConfiguration,
} from "../models/yamlProjectConfiguration.js";
import { checkYamlFileExists, getAllFilesFromCurrentPath, readUTF8File } from "./file.js";
import { parse } from "yaml";
import babel from '@babel/core';
import fs from "fs"
import FileDetails from "../models/fileDetails.js";


async function getDecoratorsFromFile(file: string) {
    const inputCode = fs.readFileSync(file, 'utf8'); 
    const classes:any = []
    const extractorFunction = function extract() {
        return {
            name: "extract-decorators",
            visitor: {
                ClassDeclaration(path:any) {
                    if (path.node.decorators) {
                        const info = {path: file, name: path.node.id.name, decorators: [] as any, methods: []}
                        for (const decorator of path.node.decorators) {
                            if (decorator.expression.type === "Identifier") {
                                info.decorators = [...info.decorators ?? [], { name: decorator.expression.name }];
                            } else if (decorator.expression.type === "CallExpression") {
                                info.decorators = [...info.decorators ?? [], { name: decorator.expression.callee.name, arguments: decorator.expression.arguments.map((a: any) => a.value) }];
                            }
                        }
                        classes.push(info)
                    }
                },
                ClassMethod(path: any) {
                    if (path.node.decorators) {
                        const className = path.context.parentPath.container.id.name
                        const methodName = path.node.key.name
                        for (const decorator of path.node.decorators) {
                            const info = { name: methodName, decorators: [] as any }
                            let existingClass = classes.find((c: any) => c.name === className);
                            if (!existingClass) {
                                existingClass = {path: file, name: path.node.id.name, decorators: [] as any, methods: []}
                                classes.push(existingClass)
                            }

                            if (decorator.expression.type === "Identifier") {
                                info.decorators = [...info.decorators ?? [], { name: decorator.expression.name }];
                            } else if (decorator.expression.type === "CallExpression") {
                                info.decorators = [...info.decorators ?? [], { name: decorator.expression.callee.name, arguments: decorator.expression.arguments.map((a: any) => {
                                    if (a.type === "StringLiteral") {
                                        return a.value
                                    } else if (a.type === "ObjectExpression") {
                                        return a.properties.reduce((acc: any, curr: any) => {
                                            acc[curr.key.value] = curr.value.value;
                                            return acc;
                                        }, {})
                                    }
                                }) }];
                            }

                            existingClass.methods.push(info);
                    }
                }
            }
            }
        };
    }

    const require = createRequire(import.meta.url);
    const packagePath = path.dirname(require.resolve("@babel/plugin-syntax-decorators"));
    await babel.transformAsync(inputCode, {
        plugins: [
            [packagePath, { version: "2023-05", decoratorsBeforeExport: false}],
            extractorFunction,
        ]
    })

    return classes;
}

async function tryToReadClassInformationFromDecorators(projectConfiguration: YamlProjectConfiguration) {
    const allJsFilesPaths = (await getAllFilesFromCurrentPath()).filter(
        (file: FileDetails) => {
            return (
                file.extension === ".js" &&
                    !file.path.includes('node_modules') &&
                    !file.path.includes('.git') 
            );
        }
    );

   return await Promise.all(allJsFilesPaths.map((file) => {
        return getDecoratorsFromFile(file.path);
    }))
}

export async function getProjectConfiguration(
  configurationFilePath = "./genezio.yaml"
): Promise<YamlProjectConfiguration> {
  if (!(await checkYamlFileExists(configurationFilePath))) {
    throw new Error("The configuration file does not exist.");
  }

  const genezioYamlPath = path.join(configurationFilePath);
  const configurationFileContentUTF8 = await readUTF8File(genezioYamlPath);
  let configurationFileContent = null;

  try {
    configurationFileContent = await parse(configurationFileContentUTF8);
  } catch (error) {
    throw new Error(`The configuration yaml file is not valid.\n${error}`);
  }
  const projectConfiguration = await YamlProjectConfiguration.create(
    configurationFileContent
  );

  const result = await tryToReadClassInformationFromDecorators(projectConfiguration)

  result.forEach((classInfo: any) => {
      if (classInfo.length < 1) {
          return
      }
     if (Object.keys(classInfo[0]).length > 0) {
        const r = projectConfiguration.classes.find((c) => path.resolve(c.path) === path.resolve(classInfo[0].path))
        const deployDecoratorFound = classInfo[0].decorators.find((d: any) => d.name === "GenezioDeploy")

        if (!r && deployDecoratorFound) {
            projectConfiguration.classes.push(new YamlClassConfiguration(classInfo[0].path, TriggerType.jsonrpc, ".js", []))
        }
     }
  });

  return projectConfiguration;
}

export async function getLocalConfiguration(
  configurationFilePath = "./genezio.local.yaml"
): Promise<YamlLocalConfiguration | undefined> {
  if (!(await checkYamlFileExists(configurationFilePath))) {
    return undefined;
  }

  const genezioYamlPath = path.join(configurationFilePath);
  const configurationFileContentUTF8 = await readUTF8File(genezioYamlPath);
  let configurationFileContent = null;

  try {
    configurationFileContent = await parse(configurationFileContentUTF8);
  } catch (error) {
    throw new Error(`The configuration yaml file is not valid.\n${error}`);
  }
  if (!configurationFileContent) {
    return undefined;
  }
  const localConfiguration = await YamlLocalConfiguration.create(
    configurationFileContent
  );

  return localConfiguration;
}
