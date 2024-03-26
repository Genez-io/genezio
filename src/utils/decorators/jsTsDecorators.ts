import path from "path";
import FileDetails from "../../models/fileDetails.js";
import { DecoratorExtractor } from "./decoratorFactory.js";
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
} from "@babel/types";
import babel from "@babel/core";
import { createRequire } from "module";
import { default as Parser } from "tree-sitter";
import { debugLogger } from "../logging.js";

export class JsTsDecoratorExtractor implements DecoratorExtractor {
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
        const treeSitterClasses = await this.getDecoratorsTreeSitter(file);
        return [...babelClasses, ...treeSitterClasses];
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

        const require = createRequire(import.meta.url);
        const packagePath = path.dirname(require.resolve("@babel/plugin-syntax-decorators"));

        await babel
            .transformAsync(inputCode, {
                presets: [require.resolve("@babel/preset-typescript")],
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

        return classes;
    }

    async getDecoratorsTreeSitter(file: string): Promise<ClassInfo[]> {
        const inputCode = fs.readFileSync(file, "utf8");
        const classes: ClassInfo[] = [];

        const require = createRequire(import.meta.url);
        const go = require("tree-sitter-typescript").typescript;
        const parser = new Parser();
        parser.setLanguage(go);

        const tree = parser.parse(inputCode);

        const root = tree.rootNode;
        root.namedChildren.forEach((child) => {
            switch (child.type) {
                case "export_statement": {
                    const exportType = child.child(1)?.type;
                    if (exportType !== "class_declaration") {
                        break;
                    }
                    const classStmt = child.child(1);
                    const className = classStmt?.child(1)?.text || "";
                    const comment = child.previousSibling;
                    if (!comment) {
                        break;
                    }
                    const commentText = comment.text;
                    if (!commentText.includes("genezio: deploy")) {
                        break;
                    }
                    const genezioDeployArguments = commentText
                        .split("genezio: deploy")[1]
                        .split(" ")
                        .filter((arg) => arg !== "");
                    const classInfo: ClassInfo = {
                        path: file,
                        name: className,
                        decorators: [
                            {
                                name: "GenezioDeploy",
                                arguments: {
                                    type: genezioDeployArguments[0] || "jsonrpc",
                                },
                            },
                        ],
                        methods: [],
                    };
                    classStmt?.namedChildren.forEach((child) => {
                        switch (child.type) {
                            case "class_body": {
                                child.namedChildren.forEach((child) => {
                                    if (child.type !== "method_definition") {
                                        return;
                                    }
                                    let methodName = child.child(0)?.text || "";
                                    if (methodName === "async") {
                                        methodName = child.child(1)?.text || "";
                                    }
                                    const comment = child.previousSibling;
                                    if (comment?.type !== "comment") {
                                        return;
                                    }
                                    const commentText = comment?.text || "";
                                    if (!commentText.includes("genezio:")) {
                                        return;
                                    }
                                    const genezioMethodArguments = commentText
                                        .split("genezio:")[1]
                                        .split(" ")
                                        .filter((arg) => arg !== "");
                                    if (genezioMethodArguments.length < 1) {
                                        return;
                                    }
                                    let decoratorArguments = {};
                                    switch (genezioMethodArguments[0]) {
                                        case "http": {
                                            decoratorArguments = {
                                                type: "http",
                                            };
                                            break;
                                        }
                                        case "cron": {
                                            decoratorArguments = {
                                                type: "cron",
                                                cronString: genezioMethodArguments
                                                    .slice(1)
                                                    .join(" "),
                                            };
                                            break;
                                        }
                                        default: {
                                            decoratorArguments = {
                                                type: "jsonrpc",
                                            };
                                            break;
                                        }
                                    }
                                    classInfo.methods.push({
                                        name: methodName,
                                        decorators: [
                                            {
                                                name: "GenezioMethod",
                                                arguments: decoratorArguments,
                                            },
                                        ],
                                    });
                                });
                                break;
                            }
                            default: {
                                break;
                            }
                        }
                    });
                    classes.push(classInfo);
                    break;
                }
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
