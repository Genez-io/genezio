import { Program } from "typescript";
import { TriggerType, YamlProjectConfiguration } from "../../models/yamlProjectConfiguration";


export class MethodConfiguration {
  name: string;
  type: TriggerType;
  cronString?: string;

  constructor(name: string, type?: TriggerType, cronString?: string) {
    this.name = name;
    this.type = type ?? TriggerType.jsonrpc;
    this.cronString = cronString;
  }
}

export class ClassConfiguration {
  type: TriggerType;
  path: string;
  program: Program; // the ast of the class
  methodsMap: { [id: string]: MethodConfiguration };

  constructor(
    type: TriggerType,
    path: string,
    program: Program,
    methodsMap: { [id: string]: MethodConfiguration }
  ) {
    this.type = type;
    this.path = path;
    this.program = program;
    this.methodsMap = methodsMap;
  }

  getMethods(): MethodConfiguration[] {
    return Object.values(this.methodsMap);
  }
}

// This class represents the complete representation of the genezio project
export class ProjectConfiguration {
  yamlProjectConfiguration: YamlProjectConfiguration;
  classesMap: { [id: string]: ClassConfiguration };

  constructor(yamlProjectConfiguration: YamlProjectConfiguration) {
    this.yamlProjectConfiguration = yamlProjectConfiguration;
    this.classesMap = {};
  }

  getMethodType(path: string, methodName: string): TriggerType {
    if (!this.classesMap[path]) {
      throw new Error(
        `Class ${path} not found in project configuration`
      );
    }
    if (
      !this.classesMap[path].methodsMap[methodName] ||
      !this.classesMap[path].methodsMap[methodName].type
    ) {
      return this.classesMap[path].type;
    }
    return this.classesMap[path].methodsMap[methodName].type;
  }

  addClass(path: string, program: Program) {
    const classElem = this.yamlProjectConfiguration.classes.find(
      (c) => { return c.path === path }
    );

    if (!classElem) {
      throw new Error(
        `Class with ${path} not found in project configuration`
      );
    }

    const methodsMap: { [id: string]: MethodConfiguration } = {};
    const methods = classElem.methods;
    if (methods) {
      for (const method of methods) {
        methodsMap[method.name] = method;
      }
    }

    this.classesMap[path] = new ClassConfiguration(
      classElem.type,
      classElem.path,
      program,
      methodsMap
    );
  }

  getClass(path: string): ClassConfiguration {
    if (!this.classesMap[path]) {
      throw new Error(
        `Class ${path} not found in project configuration`
      );
    }
    return this.classesMap[path];
  }

  getAllClasses(): ClassConfiguration[] {
    return Object.values(this.classesMap);
  }
}
