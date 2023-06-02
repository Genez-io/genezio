import path from "path";
import fs from "fs";
import {
  AstGeneratorInterface,
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
  VoidType,
  DateType,
} from "../../models/genezioModels";

import { checkIfDartIsInstalled, getDartAstGeneratorPath, getDartSdkVersion } from "../../utils/dart";
import { createTemporaryFolder, deleteFolder, fileExists } from "../../utils/file";
import { runNewProcess, runNewProcessWithResultAndReturnCode } from "../../utils/process";
import { GENEZIO_NO_SUPPORT_FOR_BUILT_IN_TYPE, GENEZIO_NO_SUPPORT_FOR_OPTIONAL_DART } from "../../errors";

// These are dart:core build-in errors that are not currently supported by the Genezio AST
const dartNotSupportedBuiltInErrors = [
    'AbstractClassInstantiationError',
    'ConcurrentModificationError',
    'CyclicInitializationError',
    'Error',
    'FallThroughError',
    'IntegerDivisionByZeroException',
    'NoSuchMethodError',
    'NullThrownError',
    'OutOfMemoryError',
    'RangeError',
    'StateError',
    'StackOverflowError',
    'TypeError',
    'UnimplementedError',
    'UnsupportedError'
  ]

// These are dart:core build-in types that are not currently supported by the Genezio AST
const dartNotSupportedBuiltInTypes = [
  'BidirectionalIterator',
  'Comparable',
  'Duration',
  'Exception',
  'Expando',
  'FormatException',
  'Function',
  'Invocation',
  'Iterable',
  'Iterator',
  'Match',
  'Null',
  'Pattern',
  'RegExp',
  'RuneIterator',
  'Runes',
  'Set',
  'StackTrace',
  'Stopwatch',
  'StringBuffer',
  'StringSink',
  'Symbol',
  'Type',
  'Uri',
  'num'
]

export class AstGenerator implements AstGeneratorInterface {
  #parseList(type: string): ArrayType|undefined {
    const listToken = "List<";
    if (type.startsWith(listToken)) {
      const lastIndex = type.length - 1;
      // If the List is optional, we need to remove the last character
      if (type[type.length - 1] === "?") {
        throw new Error(GENEZIO_NO_SUPPORT_FOR_OPTIONAL_DART);
      }

      // Check for not supported built-in types
      if (dartNotSupportedBuiltInTypes.includes(type) || dartNotSupportedBuiltInErrors.includes(type)) {
        throw new Error(`${type} not supported.\n` + GENEZIO_NO_SUPPORT_FOR_BUILT_IN_TYPE)
      }

      const extractedString = type.substring(listToken.length, lastIndex);
      return {
        type: AstNodeType.ArrayType,
        generic: this.#mapTypesToParamType(extractedString),
      }
    } else {
      return undefined;
    }
  }

  #parseMap(type: string): MapType|undefined {
    const mapToken = "Map<";
    if (type.startsWith(mapToken)) {
      const cleanedType = type.replace(" ", "");
      const lastIndex = cleanedType.length - 1;
      // If the Map is optional, we need to remove the last character
      if (cleanedType[cleanedType.length - 1] === "?") {
        throw new Error(GENEZIO_NO_SUPPORT_FOR_OPTIONAL_DART)
      }

      // Check for not supported built-in types
      if (dartNotSupportedBuiltInTypes.includes(type) || dartNotSupportedBuiltInErrors.includes(type)) {
        throw new Error(`${type} not supported.\n` + GENEZIO_NO_SUPPORT_FOR_BUILT_IN_TYPE)
      }

      const extractedString = cleanedType.substring(mapToken.length, lastIndex);
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
    const promiseToken = "Future<";
    if (type.startsWith(promiseToken)) {
      const extractedString = type.substring(promiseToken.length, type.length - 1);
      return {
        type: AstNodeType.PromiseType,
        generic: this.#mapTypesToParamType(extractedString),
      }
    }
  }

  #mapTypesToParamType(type: string): DoubleType | IntegerType | StringType | BooleanType | FloatType | AnyType | ArrayType | MapType | PromiseType | CustomAstNodeType | VoidType | DateType {
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

    // Remove the Optional property for now, we don't support it.
    if (type[type.length - 1] === "?") {
      throw new Error(GENEZIO_NO_SUPPORT_FOR_OPTIONAL_DART)
    }

    // Check for not supported built-in types
    if (dartNotSupportedBuiltInTypes.includes(type) || dartNotSupportedBuiltInErrors.includes(type)) {
      throw new Error(`${type} not supported.\n` + GENEZIO_NO_SUPPORT_FOR_BUILT_IN_TYPE)
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
      case "void": {
        return {
          type: AstNodeType.VoidLiteral,
        }
      }
      case "DateTime":
        return {
          type: AstNodeType.DateType,
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

  async #compileGenezioDartAstExtractor(genezioAstExtractorPath: string) {
    const folder = await createTemporaryFolder();
    // Clone the dart ast generator.
    await runNewProcess("git clone https://github.com/Genez-io/dart-ast.git .", folder)
    await runNewProcess("dart pub get", folder)

    // Compile the dart ast generator.
    await runNewProcess(`dart compile aot-snapshot main.dart -o ${genezioAstExtractorPath}`, folder)

    // Remove the temporary folder.
    await deleteFolder(folder);
  }

  async generateAst(path: string, classNames: string[]): Promise<AstGeneratorOutput> {
    // Check if dart is installed.
    await checkIfDartIsInstalled();

    // Get the dart sdk version.
    const dartSdkVersion = getDartSdkVersion()?.toString();
    if (!dartSdkVersion) {
      throw new Error("Unable to get the dart sdk version.");
    }

    // Get the path of the dart ast extractor.
    const {directory:genezioAstExtractorDir, path:genezioAstExtractorPath} = getDartAstGeneratorPath(dartSdkVersion);

    // Check if the dart ast extractor is compiled and installed in home.
    const compiled = await fileExists(genezioAstExtractorPath);
    if (!compiled) {
      // Check if the folder exists, if not, create it.
      if (!fs.existsSync(genezioAstExtractorDir)) {
        fs.mkdirSync(genezioAstExtractorDir);
      }
      await this.#compileGenezioDartAstExtractor(genezioAstExtractorPath);
    }

    const result = await runNewProcessWithResultAndReturnCode(`dartaotruntime ${genezioAstExtractorPath} ${path}`)
    // If the result is not 0, it means that the ast generator failed.
    if (result.code !== 0) {
      throw new Error(`Dart runtime error: ${result.stderr}`);
    }
    const ast = JSON.parse(result.stdout);
    console.log(ast);

    const mainClasses = ast.classes.filter((c: any) => classNames.includes(c.name));

    const genezioClasses: ClassDefinition[] = mainClasses.map((c: any) => ({
      type: AstNodeType.ClassDefinition,
      path: c.declarationPath,
      name: c.name,
      methods: c.methods.map((m: any) => {
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
    }));

    const body: Node[] = [...genezioClasses];

    const otherClasses = ast.classes.filter((c: any) => !classNames.includes(c.name));
    otherClasses.forEach((c: any) => {
      const genezioClass: StructLiteral = {
        type: AstNodeType.StructLiteral,
        name: c.name,
        path: c.declarationPath,
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

const supportedExtensions = [".dart"]

export default { supportedExtensions, AstGenerator }
