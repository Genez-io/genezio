import path from "path";
import FileDetails from "../../models/fileDetails.js";
import fs from "fs";
import { ClassInfo, MethodInfo } from "./decoratorTypes.js";
import { NodePath } from "@babel/traverse";
import {
    ClassDeclaration,
    ClassMethod,
    isCallExpression,
    isIdentifier,
    isClassDeclaration,
    CallExpression,
    isObjectExpression,
    isObjectProperty,
    isStringLiteral,
    ExportDeclaration,
    isExportDefaultDeclaration,
    isExportNamedDeclaration,
} from "@babel/types";
import babel from "@babel/core";
import { createRequire } from "module";
import { debugLogger } from "../logging.js";
import { DecoratorExtractor } from "./baseDecoratorExtractor.js";

export class JsTsDecoratorExtractor extends DecoratorExtractor {
    fileFilter(cwd: string): (file: FileDetails) => boolean {
        return (file: FileDetails) => {
            const folderPath = path.join(cwd, file.path);
            return (
                (file.extension === ".js" || file.extension === ".ts") &&
                !file.path.includes("node_modules") &&
                !file.path.includes(".git") &&
                !fs.lstatSync(folderPath).isDirectory()
            );
        };
    }

    async getDecoratorsFromFile(file: string): Promise<ClassInfo[]> {
        const babelClasses = await this.getDecoratorsBabel(file);
        return [...babelClasses];
    }

    async getDecoratorsBabel(file: string): Promise<ClassInfo[]> {
        const inputCode = fs.readFileSync(file, "utf8");
        const classes: ClassInfo[] = [];
        const extractorFunction = function extract() {
            return {
                name: "extract-decorators",
                visitor: {
                    ClassDeclaration(path: NodePath<ClassDeclaration>) {
                        if (path.node.decorators) {
                            const info: ClassInfo = {
                                path: file,
                                name: path.node.id?.name ?? "default",
                                decorators: [],
                                methods: [],
                            };
                            for (const decorator of path.node.decorators) {
                                if (isIdentifier(decorator.expression)) {
                                    info.decorators = [
                                        ...(info.decorators ?? []),
                                        { name: decorator.expression.name },
                                    ];
                                } else if (
                                    isCallExpression(decorator.expression) &&
                                    isIdentifier(decorator.expression.callee)
                                ) {
                                    info.decorators = [
                                        ...(info.decorators ?? []),
                                        {
                                            name: decorator.expression.callee.name,
                                            arguments: JsTsDecoratorExtractor.parseArguments(
                                                decorator.expression.arguments,
                                            ),
                                        },
                                    ];
                                }
                            }
                            classes.push(info);
                        }
                    },
                    ClassMethod(path: NodePath<ClassMethod>) {
                        if (path.node.decorators) {
                            const classDeclarationNode = path.context.parentPath.parentPath?.node;
                            const className = isClassDeclaration(classDeclarationNode)
                                ? classDeclarationNode.id?.name ?? "defaultClass"
                                : "defaultClass";

                            const methodIdentifierNode = path.node.key;
                            const methodName = isIdentifier(methodIdentifierNode)
                                ? methodIdentifierNode.name
                                : "defaultMethod";

                            for (const decorator of path.node.decorators) {
                                const info: MethodInfo = {
                                    name: methodName,
                                    decorators: [],
                                };
                                let existingClass = classes.find((c) => c.name === className);
                                if (!existingClass) {
                                    existingClass = {
                                        path: file,
                                        name: className,
                                        decorators: [],
                                        methods: [],
                                    };
                                    classes.push(existingClass);
                                }

                                if (isIdentifier(decorator.expression)) {
                                    info.decorators = [
                                        ...(info.decorators ?? []),
                                        { name: decorator.expression.name },
                                    ];
                                } else if (
                                    isCallExpression(decorator.expression) &&
                                    isIdentifier(decorator.expression.callee)
                                ) {
                                    info.decorators = [
                                        ...(info.decorators ?? []),
                                        {
                                            name: decorator.expression.callee.name,
                                            arguments: JsTsDecoratorExtractor.parseArguments(
                                                decorator.expression.arguments,
                                            ),
                                        },
                                    ];
                                }

                                existingClass.methods.push(info);
                            }
                        }
                    },
                },
            };
        };
        const extractorFunctionComments = function extract() {
            return {
                name: "extract-comments",
                visitor: {
                    ExportDeclaration(path: NodePath<ExportDeclaration>) {
                        if (
                            isExportDefaultDeclaration(path.node) ||
                            isExportNamedDeclaration(path.node)
                        ) {
                            const classDeclarationNode = path.node.declaration;
                            if (isClassDeclaration(classDeclarationNode)) {
                                const className = classDeclarationNode.id?.name ?? "default";
                                const comments = path.node.leadingComments;
                                if (comments && comments.length > 0) {
                                    const lastComment = comments[comments.length - 1];
                                    if (
                                        lastComment.value.includes("genezio: deploy") &&
                                        lastComment.type === "CommentLine"
                                    ) {
                                        const classInfo = DecoratorExtractor.createGenezioClassInfo(
                                            className,
                                            file,
                                            lastComment.value,
                                        );
                                        classes.push(classInfo);
                                    }
                                }
                            }
                        }
                    },
                    ClassDeclaration(path: NodePath<ClassDeclaration>) {
                        if (path.node.leadingComments) {
                            const leadingComments = path.node.leadingComments;
                            if (leadingComments.length > 0) {
                                const lastComment = leadingComments[leadingComments.length - 1];
                                if (
                                    lastComment.value.includes("genezio: deploy") &&
                                    lastComment.type === "CommentLine"
                                ) {
                                    const className = path.node.id?.name ?? "default";
                                    const classInfo = DecoratorExtractor.createGenezioClassInfo(
                                        className,
                                        file,
                                        lastComment.value,
                                    );
                                    classes.push(classInfo);
                                }
                            }
                        }
                    },
                    ClassMethod(path: NodePath<ClassMethod>) {
                        const classDeclarationNode = path.context.parentPath.parentPath?.node;
                        const className = isClassDeclaration(classDeclarationNode)
                            ? classDeclarationNode.id?.name ?? "defaultClass"
                            : "defaultClass";

                        const methodIdentifierNode = path.node.key;
                        const methodName = isIdentifier(methodIdentifierNode)
                            ? methodIdentifierNode.name
                            : "defaultMethod";
                        let existingClass = classes.find((c) => c.name === className);
                        if (!existingClass) {
                            existingClass = {
                                path: file,
                                name: className,
                                decorators: [],
                                methods: [],
                            };
                            classes.push(existingClass);
                        }
                        if (path.node.leadingComments) {
                            const leadingComments = path.node.leadingComments;
                            if (leadingComments.length > 0) {
                                const lastComment = leadingComments[leadingComments.length - 1];
                                if (
                                    lastComment.value.includes("genezio:") &&
                                    lastComment.type === "CommentLine"
                                ) {
                                    const methodInfo = DecoratorExtractor.createGenezioMethodInfo(
                                        methodName,
                                        lastComment.value,
                                    );
                                    if (methodInfo) {
                                        existingClass.methods.push(methodInfo);
                                    }
                                }
                            }
                        }
                    },
                },
            };
        };

        const require = createRequire(import.meta.url);
        const packagePath = path.dirname(require.resolve("@babel/plugin-syntax-decorators"));

        await babel
            .transformAsync(inputCode, {
                presets: [
                    [require.resolve("@babel/preset-typescript"), { allowDeclareFields: true }],
                ],
                plugins: [
                    [packagePath, { version: "2023-05", decoratorsBeforeExport: false }],
                    extractorFunction,
                ],
                filename: file,
                configFile: false,
            })
            .catch((error) => {
                if (error.reasonCode == "MissingOneOfPlugins") {
                    debugLogger.error(`Error while parsing the file ${file}`, error);
                    return [];
                } else {
                    throw error;
                }
            });
        await babel
            .transformAsync(inputCode, {
                presets: [
                    [require.resolve("@babel/preset-typescript"), { allowDeclareFields: true }],
                ],
                plugins: [
                    [packagePath, { version: "2023-05", decoratorsBeforeExport: false }],
                    extractorFunctionComments,
                ],
                filename: file,
                configFile: false,
            })
            .catch((error) => {
                if (error.reasonCode == "MissingOneOfPlugins") {
                    debugLogger.error(`Error while parsing the file ${file}`, error);
                    return [];
                } else {
                    throw error;
                }
            });

        return classes;
    }

    static parseArguments(args: CallExpression["arguments"]): { [key: string]: string } {
        if (!args) {
            return {};
        }

        return args
            .map((arg) => {
                if (isObjectExpression(arg)) {
                    return arg.properties.reduce(
                        (acc: Array<{ key: string; value: string }>, curr) => {
                            if (
                                isObjectProperty(curr) &&
                                (isIdentifier(curr.key) || isStringLiteral(curr.key)) &&
                                isStringLiteral(curr.value)
                            ) {
                                const key = isIdentifier(curr.key) ? curr.key.name : curr.key.value;
                                return [...acc, { key, value: curr.value.value }];
                            }

                            return [...acc];
                        },
                        [],
                    );
                } else {
                    return undefined;
                }
            })
            .filter((a) => a !== undefined)
            .flat()
            .reduce((acc: { [key: string]: string }, curr) => {
                acc[curr!.key] = curr!.value;
                return acc;
            }, {});
    }
}
