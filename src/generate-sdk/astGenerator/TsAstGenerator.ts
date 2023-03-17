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
} from "../../models/genezio-models";

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
    const fileData = input.file.data;

    const parserTest = new TypescriptParser();

    const result = await parserTest.parseSource(fileData.toString());
    let classDefinition: ClassDefinition | undefined = undefined;
    const types: TypeAlias[] = [];

    for (const declaration2 of result.declarations) {
      const declaration: any = { ...declaration2 };

      if (!declaration.isExported) {
        continue;
      }

      if (!declaration.methods || declaration.methods?.length == 0) {
        // const parameters: Parameter[] = [];
        // for (const parameter of declaration.properties) {
        //   parameters.push(new Parameter(parameter.name, parameter.type));
        // }
        const definition = fileData
          .toString()
          .substring(declaration.start, declaration.end);
        types.push({
          type: AstNodeType.TypeAlias,
          name: declaration.name,
          definition: definition
        });
      }

      if (declaration.methods?.length > 0) {
        classDefinition = {
          type: AstNodeType.ClassDefinition,
          name: declaration.name,
          methods: []
        };
        for (const method of declaration.methods) {
          // Skip private methods.
          if (method.name.startsWith("#")) {
            continue;
          }

          const parameters: ParameterDefinition[] = [];
          for (const parameter of method.parameters) {
            const type: TypeAlias | undefined = types.find(
              (x) => x.name == parameter.type
            );
            const isTypeAlias: boolean = type !== undefined;
            const nativeType: NativeType = {
              type: AstNodeType.NativeType,
              paramType: this.mapTypesToParamType(parameter.type)
            };
            const paramType: TypeDefinition = isTypeAlias
              ? (type as TypeAlias)
              : nativeType;
            parameters.push({
              type: AstNodeType.ParameterDefinition,
              name: parameter.name,
              rawType: parameter.type,
              paramType: { ...paramType },
              optional: false
              // defaultValue: param.right? param.right.value : undefined
            });
          }

          let returnType: TypeDefinition;

          if (method.type) {
            const returnTypeAlias: TypeAlias | undefined = types.find(
              (x) => x.name == method.type
            );
            const isTypeAlias: boolean = returnTypeAlias !== undefined;
            const returnNativeType: NativeType = {
              type: AstNodeType.NativeType,
              paramType: this.mapTypesToParamType(method.type)
            };
            returnType = isTypeAlias
              ? (returnTypeAlias as TypeAlias)
              : returnNativeType;
          } else {
            const returnAny: NativeType = {
              type: AstNodeType.NativeType,
              paramType: NativeTypeEnum.any
            };
            returnType = returnAny;
          }

          classDefinition.methods.push({
            type: AstNodeType.MethodDefinition,
            name: method.name,
            static: false,
            kind: MethodKindEnum.method,
            returnType: returnType,
            params: parameters
          });
        }
      }
    }

    if (classDefinition) classDefinition.typeDefinitions = [...types];

    if (classDefinition === undefined) {
      throw new Error("No class definition found");
    } else {
      return {
        program: {
          body: [classDefinition],
          originalLanguage: "ts",
          sourceType: SourceType.module
        }
      };
    }
  }
}

const supportedExtensions = ["ts"]

export default {supportedExtensions, AstGenerator}