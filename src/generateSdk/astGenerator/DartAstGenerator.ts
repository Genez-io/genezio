import os from "os";
import path from "path";
import { TypescriptParser } from "typescript-parser";
import {
  AstGeneratorInterface,
  NativeTypeEnum,
  AstGeneratorInput,
  ClassDefinition,
  TypeAlias,
  AstNodeType,
  ParameterDefinition,
  NativeType,
  MethodKindEnum,
  SourceType,
  AstGeneratorOutput,
  TypeDefinition
} from "../../models/genezioModels";
import { isDartInstalled } from "../../utils/dart";
import { createTemporaryFolder, fileExists } from "../../utils/file";
import { runNewProcess, runNewProcessWithResult } from "../../utils/process";

export class AstGenerator implements AstGeneratorInterface {
  mapTypesToParamType(type: string): NativeTypeEnum | string {
    switch (type) {
      case "string":
        return NativeTypeEnum.string;
      case "number":
        return NativeTypeEnum.number;
      case "boolean":
        return NativeTypeEnum.boolean;
      case "String":
        return NativeTypeEnum.string;
      case "Number":
        return NativeTypeEnum.number;
      case "Boolean":
        return NativeTypeEnum.boolean;
      //case arrays
      case "string[]":
        return NativeTypeEnum.stringArray;
      case "number[]":
        return NativeTypeEnum.numberArray;
      case "boolean[]":
        return NativeTypeEnum.booleanArray;
      case "String[]":
        return NativeTypeEnum.stringArray;
      case "Number[]":
        return NativeTypeEnum.numberArray;
      case "Boolean[]":
        return NativeTypeEnum.booleanArray;
      case "any":
        return NativeTypeEnum.any;
      default:
        return type;
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
      console.log("RESULT: ", JSON.parse(result))

      const classes = ast.classes.filter((c: any) => c.methods > 0);
      if (classes.length > 1) {
        // TODO handle error
      }

      // const classToDeploy = classes[0];

      // const genezioClass: ClassDefinition = {
      //   type: AstNodeType.ClassDefinition,
      //   name: classToDeploy.name,
      //   methods: classToDeploy.methods.map((m: any) => {
      //     return {
      //       name: m.name,
      //       parameters: m.parameters.map((p: any) => {
      //         return {
      //           name: p.name,
      //           type: this.mapTypesToParamType(p.type),
      //           rawType: p.type,
      //         };
      //       }),
      //       returnType: {
      //         type: this.mapTypesToParamType(m.returnType),
      //       },
      //       kind: MethodKindEnum.method,
      //     };
      //   }),
      // }
      
      // const enums = ast.enums.map((e: any) => {
      //   return {
      //     type: AstNodeType.Enum,
      //     name: e.name,
      //     params: {
      //       name: e.name,
      //     }
      //   }
      // });

      // const typeAliases = ast.enums.map((e: any) => {
      //   return {
      //     type: AstNodeType.TypeAlias,
      //     name: e.name,
      //     params: {
      //       name: e.name,
      //     },
      //     definition: `typedef ${e.name} = ${e.type};}`
      //   }
      // });

      return {
        program: {
          body: [{
            type: AstNodeType.ClassDefinition,
            name: "HelloWorldService",
            methods: [],
          }],
          originalLanguage: "dart",
          sourceType: SourceType.module
        }
      };
  }
}

const supportedExtensions = ["dart"]

export default {supportedExtensions, AstGenerator}