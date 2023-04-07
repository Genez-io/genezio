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
} from "../../models/genezioAst";
import { isDartInstalled } from "../../utils/dart";
import { createTemporaryFolder, fileExists } from "../../utils/file";
import { runNewProcess, runNewProcessWithResult } from "../../utils/process";

export class AstGenerator implements AstGeneratorInterface {
  mapTypesToParamType(type: string): AstNodeType {
    switch (type) {
      case "String":
        return AstNodeType.StringLiteral;
      case "int":
        return AstNodeType.IntegerLiteral;
      case "double":
        return AstNodeType.DoubleLiteral;
      case "bool":
        return AstNodeType.BooleanLiteral;
      default:
        return AstNodeType.AnyLiteral;
    }
  }

  async generateAst(input: AstGeneratorInput): Promise<AstGeneratorOutput> {
      const dartIsInstalled = isDartInstalled()

      console.log("GENERATE AST FROM DART!");

      if (!dartIsInstalled) {
        throw new Error("Dart is not installed.")
      }

      const compiled = await fileExists(os.homedir() + "/.dart_ast_generator/genezioDartAstGenerator.aot");
      console.log("FILE EXISTS?", compiled);
      if (!compiled) {
        console.log("STAART!");
        const folder = await createTemporaryFolder();
        await runNewProcess("git clone https://github.com/Genez-io/dart-ast.git .", folder)
        await runNewProcess("dart pub get", folder)
        await runNewProcess("mkdir ~/.dart_ast_generator/", folder)
        await runNewProcess(`dart compile aot-snapshot main.dart -o ${os.homedir()}/.dart_ast_generator/genezioDartAstGenerator.aot`, folder)
        console.log("Dart AST Generator compiled!")
      }

      const absfilePath = path.resolve(input.file.path);
      console.log("INPUT", absfilePath)
      const result = await runNewProcessWithResult(`dartaotruntime ${os.homedir()}/.dart_ast_generator/genezioDartAstGenerator.aot ${absfilePath}`)
      const ast = JSON.parse(result);
      console.log("RESULT: ", result);

      const mainClasses = ast.classes.filter((c: any) => c.methods.length > 1);
      if (mainClasses.length > 1) {
        // TODO handle error
      }
      const otherClasses = ast.classes.filter((c: any) => c.methods.length === 1);

      const classToDeploy = mainClasses[0];
      console.log({classToDeploy})

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
                paramType: this.mapTypesToParamType(p.type),
                rawType: p.type,
              };
            }),
            returnType: {
              type: this.mapTypesToParamType(m.returnType),
            },
            kind: MethodKindEnum.method,
          };
        }),
      }

      const body: [Node] = [genezioClass];

      otherClasses.forEach((c: any) => {
        const genezioClass: StructLiteral = {
          type: AstNodeType.StructLiteral,
          name: c.name,
          typeLiteral: {
            type: AstNodeType.TypeLiteral,
            properties: c.fields.map((p: any) => {
              return {
                name: p.name,
                type: this.mapTypesToParamType(p.type),
                rawType: p.type,
              };
            }),
          }
        }
        body.push(genezioClass);
      });

      console.log(JSON.stringify(body));

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

export default {supportedExtensions, AstGenerator}