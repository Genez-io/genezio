/* eslint-disable @typescript-eslint/no-var-requires */
import {
  AstGeneratorInput,
  AstGeneratorInterface,
  AstGeneratorOutput,
  AstNodeType,
  ClassDefinition,
  MethodKindEnum,
  AnyType,
  ParameterDefinition,
  SourceType
} from "../../models/genezioModels.js";
import parser from "@babel/parser";
import traverse from "@babel/traverse";

class AstGenerator implements AstGeneratorInterface {
  async generateAst(input: AstGeneratorInput): Promise<AstGeneratorOutput> {
    const fileData = input.class.data;
    const result = parser.parse(fileData.toString(), {
      // parse in strict mode and allow module declarations
      sourceType: "module",

      plugins: [
        // enable jsx and flow syntax
        "jsx",
        "flow"
      ]
    });

    let classDefinition: ClassDefinition | undefined = undefined;

    traverse.default(result, {
      enter(path: any) {
        if (path.type === "ClassDeclaration") {
          classDefinition = {
            type: AstNodeType.ClassDefinition,
            name: path.node.id.name,
            methods: []
          };
        } else if (
          // old school function declaration syntax
          path.type === "ClassMethod" &&
          path.node.kind !== "constructor"
        ) {
          const returnType: AnyType = {
            type: AstNodeType.AnyLiteral,
          };
          classDefinition?.methods.push({
            type: AstNodeType.MethodDefinition,
            name: path.node.key.name,
            static: false,
            kind: MethodKindEnum.method,
            returnType: returnType,
            params: path.node.params.map(function (param: any) {
              const astType: AnyType = {
                type: AstNodeType.AnyLiteral,
              };
              const astParam: ParameterDefinition = {
                type: AstNodeType.ParameterDefinition,
                name: param.name ? param.name : param.left.name,
                rawType: "any",
                paramType: astType,
                optional: false,
                defaultValue: param.right ? param.right.value : undefined
              };

              return astParam;
            })
          });
        } else if (
          // arrow function declaration synntax
          path.type === "ClassProperty" &&
          path.node?.value?.type === "ArrowFunctionExpression"
        ) {
          const returnType: AnyType = {
            type: AstNodeType.AnyLiteral,
          };
          classDefinition?.methods.push({
            type: AstNodeType.MethodDefinition,
            name: path.node.key.name,
            static: false,
            kind: MethodKindEnum.method,
            returnType: returnType,
            params: path.node.value.params.map(function (param: any) {
              const astType: AnyType = {
                type: AstNodeType.AnyLiteral,
              };
              const astParam: ParameterDefinition = {
                type: AstNodeType.ParameterDefinition,
                name: param.name ? param.name : param.left.name,
                rawType: "any",
                paramType: astType,
                optional: false,
                defaultValue: param.right ? param.right.value : undefined
              };

              return astParam;
            })
          });
        }
      }
    });

    if (classDefinition == undefined) {
      throw new Error("No class definition found");
    } else {
      return {
        program: {
          body: [classDefinition],
          originalLanguage: "js",
          sourceType: SourceType.module
        }
      };
    }
  }
}

const supportedExtensions = ["js"];

export default { supportedExtensions, AstGenerator }