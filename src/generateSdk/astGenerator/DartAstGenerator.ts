import os from "os";
import path from "path";
import fs from "fs";
import {
  AstGeneratorInterface,
  AstGeneratorInput,
  ClassDefinition,
  AstNodeType,
  MethodKindEnum,
  SourceType,
  AstGeneratorOutput,
  StructLiteral,
  Node,
  MethodDefinition,
  DoubleType,
  IntegerType,
  StringType,
  BooleanType,
  FloatType,
  AnyType,
  CustomAstNodeType,
  ArrayType,
  PromiseType,
  MapType,
} from "../../models/genezioModels";
import { checkIfDartIsInstalled } from "../../utils/dart";
import { createTemporaryFolder, fileExists } from "../../utils/file";
import { runNewProcess, runNewProcessWithResult } from "../../utils/process";

export class AstGenerator implements AstGeneratorInterface {
  #parseList(type: string): ArrayType|undefined {
    if (type.startsWith("List<")) {
      const extractedString = type.substring(5, type.length - 1);
      return {
        type: AstNodeType.ArrayType,
        generic: this.#mapTypesToParamType(extractedString),
      }
    } else {
      return undefined;
    }
  }

  #parseMap(type: string): MapType|undefined {
    if (type.startsWith("Map<")) {
      const cleanedType = type.replace(" ", "");
      const extractedString = cleanedType.substring(4, cleanedType.length - 1);
      const components = extractedString.split(",");
      const key = components[0];
      const value = components.slice(1).join(",");

      return {
        type: AstNodeType.MapType,
        genericKey: this.#mapTypesToParamType(key),
        genericValue: this.#mapTypesToParamType(value),
      }
    }
  }

  #parsePromise(type: string): PromiseType|undefined {
    if (type.startsWith("Future<")) {
      const extractedString = type.substring(7, type.length - 1);
      return {
        type: AstNodeType.PromiseType,
        generic: this.#mapTypesToParamType(extractedString),
      }
    }
  }

  #mapTypesToParamType(type: string): DoubleType | IntegerType | StringType | BooleanType | FloatType | AnyType | ArrayType | MapType | PromiseType | CustomAstNodeType {
    const list = this.#parseList(type)
    if (list) {
      return list;
    }

    const map = this.#parseMap(type)
    if (map) {
      return map;
    }

    const promise = this.#parsePromise(type)
    if (promise) {
      return promise;
    }

    switch (type) {
      case "String":
        return {
          type: AstNodeType.StringLiteral,
        }
      case "int":
        return {
          type: AstNodeType.IntegerLiteral,
        }
      case "double":
        return {
          type: AstNodeType.DoubleLiteral,
        }
      case "bool":
        return {
          type: AstNodeType.BooleanLiteral,
        }
      case "Object":
        return {
          type: AstNodeType.AnyLiteral,
        };
      default:
        return {
          type: AstNodeType.CustomNodeLiteral,
          rawValue: type,
        }
    }
  }

  async #compileGenezioDartAstExtractor() {
    const folder = await createTemporaryFolder();
    await runNewProcess("git clone https://github.com/Genez-io/dart-ast.git .", folder)
    await runNewProcess("dart pub get", folder)
    if (!fs.existsSync(path.join(os.homedir(), ".dart_ast_generator"))) {
      fs.mkdirSync(path.join(os.homedir(), ".dart_ast_generator"));
    }
    await runNewProcess(`dart compile aot-snapshot main.dart -o ${os.homedir()}/.dart_ast_generator/genezioDartAstGenerator.aot`, folder)
  }

  async generateAst(input: AstGeneratorInput): Promise<AstGeneratorOutput> {
    // Check if dart is installed.
    await checkIfDartIsInstalled();

    // Check if the dart ast extractor is compiled and installed in home.
    const genezioAstGeneratorPath = path.join(os.homedir(), ".dart_ast_generator", "genezioDartAstGenerator.aot");
    const compiled = await fileExists(genezioAstGeneratorPath);
    if (!compiled) {
      await this.#compileGenezioDartAstExtractor();
    }

    const classAbsolutePath = path.resolve(input.class.path);
    const result = await runNewProcessWithResult(`dartaotruntime ${genezioAstGeneratorPath} ${classAbsolutePath}`)
    const ast = JSON.parse(result);

    const mainClasses = ast.classes.filter((c: any) => c.name === input.class.name);
    if (mainClasses.length > 1) {
      throw new Error(`No ${input.class.name} found.`);
    }

    const classToDeploy = mainClasses[0];

    const genezioClass: ClassDefinition = {
      type: AstNodeType.ClassDefinition,
      name: classToDeploy.name,
      methods: classToDeploy.methods.map((m: any) => {
        return {
          type: AstNodeType.MethodDefinition,
          name: m.name,
          params: m.parameters.map((p: any) => {
            return {
              type: AstNodeType.ParameterDefinition,
              name: p.name,
              paramType: this.#mapTypesToParamType(p.type),
              rawType: p.type,
            };
          }),
          returnType: this.#mapTypesToParamType(m.returnType),
          static: false,
          kind: MethodKindEnum.method,
        } as MethodDefinition;
      }),
    }

    const body: [Node] = [genezioClass];

    const otherClasses = ast.classes.filter((c: any) => c.name !== input.class.name);
    otherClasses.forEach((c: any) => {
      const genezioClass: StructLiteral = {
        type: AstNodeType.StructLiteral,
        name: c.name,
        typeLiteral: {
          type: AstNodeType.TypeLiteral,
          properties: c.fields.map((p: any) => {
            return {
              name: p.name,
              type: this.#mapTypesToParamType(p.type),
              rawType: p.type,
            };
          }),
        }
      }
      body.push(genezioClass);
    });

    return {
      program: {
        body: body,
        originalLanguage: "dart",
        sourceType: SourceType.module
      }
    };
  }
}

const supportedExtensions = ["dart"]

export default { supportedExtensions, AstGenerator }