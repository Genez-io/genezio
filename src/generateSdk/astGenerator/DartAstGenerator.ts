import os from "os";
import path from "path";
import { TypescriptParser } from "typescript-parser";
import {
  AstGeneratorInterface,
  AstGeneratorInput,
  ClassDefinition,
  TypeAlias,
  AstNodeType,
  ParameterDefinition,
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
  CustomNodeType,
} from "../../models/genezioAst";
import { isDartInstalled } from "../../utils/dart";
import { createTemporaryFolder, fileExists } from "../../utils/file";
import { runNewProcess, runNewProcessWithResult } from "../../utils/process";

export class AstGenerator implements AstGeneratorInterface {
  #mapTypesToParamType(type: string): DoubleType | IntegerType | StringType | BooleanType | FloatType | AnyType | CustomNodeType {
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
    await runNewProcess("mkdir ~/.dart_ast_generator/", folder)
    await runNewProcess(`dart compile aot-snapshot main.dart -o ${os.homedir()}/.dart_ast_generator/genezioDartAstGenerator.aot`, folder)
  }

  async generateAst(input: AstGeneratorInput): Promise<AstGeneratorOutput> {
    // Check if dart is installed.
    const dartIsInstalled = isDartInstalled()
    if (!dartIsInstalled) {
      throw new Error("Dart is not installed.")
    }

    // Check if the dart ast extractor is compiled and installed in home.
    const compiled = await fileExists(os.homedir() + "/.dart_ast_generator/genezioDartAstGenerator.aot");
    if (!compiled) {
      this.#compileGenezioDartAstExtractor();
    }

    const classAbsolutePath = path.resolve(input.class.path);
    const result = await runNewProcessWithResult(`dartaotruntime ${os.homedir()}/.dart_ast_generator/genezioDartAstGenerator.aot ${classAbsolutePath}`)
    const ast = JSON.parse(result);

    const mainClasses = ast.classes.filter((c: any) => c.name === input.class.name );
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

    const otherClasses = ast.classes.filter((c: any) => c.name !== input.class.name );
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