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
    SourceType,
} from "../../models/genezioModels.js";
import parser from "@babel/parser";
import traverse from "@babel/traverse";
import transformDecorators from "../../utils/transformDecorators.js";
import {
    isClassDeclaration,
    isClassMethod,
    isIdentifier,
    isAssignmentPattern,
    isClassProperty,
    isArrowFunctionExpression,
} from "@babel/types";

class AstGenerator implements AstGeneratorInterface {
    async generateAst(input: AstGeneratorInput): Promise<AstGeneratorOutput> {
        const transformedCode = await transformDecorators(input.class.path);

        const result = parser.parse(transformedCode.toString(), {
            // parse in strict mode and allow module declarations
            sourceType: "module",

            plugins: [
                // enable jsx and flow syntax
                "jsx",
                "flow",
            ],
        });

        let classDefinition: ClassDefinition | undefined = undefined;

        traverse.default(result, {
            enter(path) {
                if (isClassDeclaration(path.node)) {
                    classDefinition = {
                        type: AstNodeType.ClassDefinition,
                        name: path.node.id?.name ?? "undefined",
                        methods: [],
                        path: input.class.path,
                    };
                } else if (
                    // old school function declaration syntax
                    isClassMethod(path.node) &&
                    path.node.kind !== "constructor"
                ) {
                    const returnType: AnyType = {
                        type: AstNodeType.AnyLiteral,
                    };

                    classDefinition?.methods.push({
                        type: AstNodeType.MethodDefinition,
                        name: isIdentifier(path.node.key) ? path.node.key.name : "undefined",
                        static: false,
                        kind: MethodKindEnum.method,
                        returnType: returnType,
                        params: path.node.params.map(function (param) {
                            const astType: AnyType = {
                                type: AstNodeType.AnyLiteral,
                            };
                            let optional = false;
                            let defaultValue: { value: string; type: AstNodeType } | undefined;
                            switch (param.type) {
                                case "AssignmentPattern":
                                    optional = true;
                                    switch (param.right.type) {
                                        case "StringLiteral":
                                            defaultValue = {
                                                value: param.right.value,
                                                type: AstNodeType.StringLiteral,
                                            };
                                            break;
                                        case "NumericLiteral":
                                            defaultValue = {
                                                value: param.right.value.toString(),
                                                type: AstNodeType.DoubleLiteral,
                                            };
                                            break;
                                        case "BooleanLiteral":
                                            defaultValue = {
                                                value: param.right.value.toString(),
                                                type: AstNodeType.BooleanLiteral,
                                            };
                                            break;
                                        default:
                                            defaultValue = undefined;
                                    }
                                    break;
                                default:
                                    defaultValue = undefined;
                            }

                            const astParam: ParameterDefinition = {
                                type: AstNodeType.ParameterDefinition,
                                name: isIdentifier(param)
                                    ? param.name
                                    : isAssignmentPattern(param) && isIdentifier(param.left)
                                      ? param.left.name
                                      : "undefined",
                                rawType: "any",
                                paramType: astType,
                                optional,
                                defaultValue,
                            };

                            return astParam;
                        }),
                    });
                } else if (
                    // arrow function declaration syntax
                    isClassProperty(path.node) &&
                    isArrowFunctionExpression(path.node.value)
                ) {
                    const returnType: AnyType = {
                        type: AstNodeType.AnyLiteral,
                    };
                    classDefinition?.methods.push({
                        type: AstNodeType.MethodDefinition,
                        name: isIdentifier(path.node.key) ? path.node.key.name : "undefined",
                        static: false,
                        kind: MethodKindEnum.method,
                        returnType: returnType,
                        params: path.node.value.params.map(function (param) {
                            const astType: AnyType = {
                                type: AstNodeType.AnyLiteral,
                            };
                            let optional = false;
                            let defaultValue: { value: string; type: AstNodeType } | undefined;
                            switch (param.type) {
                                case "AssignmentPattern":
                                    optional = true;
                                    switch (param.right.type) {
                                        case "StringLiteral":
                                            defaultValue = {
                                                value: param.right.value,
                                                type: AstNodeType.StringLiteral,
                                            };
                                            break;
                                        case "NumericLiteral":
                                            defaultValue = {
                                                value: param.right.value.toString(),
                                                type: AstNodeType.DoubleLiteral,
                                            };
                                            break;
                                        case "BooleanLiteral":
                                            defaultValue = {
                                                value: param.right.value.toString(),
                                                type: AstNodeType.BooleanLiteral,
                                            };
                                            break;
                                        default:
                                            defaultValue = undefined;
                                    }
                                    break;
                                default:
                                    defaultValue = undefined;
                            }

                            const astParam: ParameterDefinition = {
                                type: AstNodeType.ParameterDefinition,
                                name: isIdentifier(param)
                                    ? param.name
                                    : isAssignmentPattern(param) && isIdentifier(param.left)
                                      ? param.left.name
                                      : "undefined",
                                rawType: "any",
                                paramType: astType,
                                optional,
                                defaultValue,
                            };

                            return astParam;
                        }),
                    });
                }
            },
        });

        if (classDefinition == undefined) {
            throw new Error("No class definition found");
        } else {
            return {
                program: {
                    body: [classDefinition],
                    originalLanguage: "js",
                    sourceType: SourceType.module,
                },
            };
        }
    }
}

const supportedExtensions = ["js"];

export default { supportedExtensions, AstGenerator };
