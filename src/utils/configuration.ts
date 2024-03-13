import path from "path";
import { createRequire } from "module";
import { YAMLBackend, YamlClass, YamlMethod } from "../yamlProjectConfiguration/v2.js";
import { getAllFilesFromPath } from "./file.js";
import babel from "@babel/core";
import fs from "fs";
import FileDetails from "../models/fileDetails.js";
import { debugLogger } from "./logging.js";
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
import { TriggerType } from "../yamlProjectConfiguration/models.js";
import { UserError } from "../errors.js";

type MethodDecoratorInfo = {
    name: string;
    arguments?: { [key: string]: string };
};

type MethodInfo = {
    name: string;
    decorators: MethodDecoratorInfo[];
};

type ClassDecoratorInfo = {
    name: string;
    arguments?: { [key: string]: string };
};

type ClassInfo = {
    path: string;
    name: string;
    decorators: ClassDecoratorInfo[];
    methods: MethodInfo[];
};

function parseArguments(args: CallExpression["arguments"]): { [key: string]: string } {
    if (!args) {
        return {};
    }

    return args
        .map((arg) => {
            if (isObjectExpression(arg)) {
                return arg.properties.reduce((acc: Array<{ key: string; value: string }>, curr) => {
                    if (
                        isObjectProperty(curr) &&
                        (isIdentifier(curr.key) || isStringLiteral(curr.key)) &&
                        isStringLiteral(curr.value)
                    ) {
                        const key = isIdentifier(curr.key) ? curr.key.name : curr.key.value;
                        return [...acc, { key, value: curr.value.value }];
                    }

                    return [...acc];
                }, []);
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

async function getDecoratorsFromFile(file: string): Promise<ClassInfo[]> {
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
                                        arguments: parseArguments(decorator.expression.arguments),
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
                                        arguments: parseArguments(decorator.expression.arguments),
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
    // const presetTypescript = path.dirname(require.resolve("@babel/preset-typescript"));
    await babel.transformAsync(inputCode, {
        presets: [require.resolve("@babel/preset-typescript")],
        plugins: [
            [packagePath, { version: "2023-05", decoratorsBeforeExport: false }],
            extractorFunction,
        ],
        filename: file,
        configFile: false,
    });

    return classes;
}

async function tryToReadClassInformationFromDecorators(
    yamlBackend: Pick<YAMLBackend, "path" | "classes">,
) {
    const cwd = yamlBackend.path || process.cwd();

    const allJsFilesPaths = (await getAllFilesFromPath(cwd)).filter((file: FileDetails) => {
        const folderPath = path.join(cwd, file.path);
        return (
            (file.extension === ".js" || file.extension === ".ts") &&
            !file.path.includes("node_modules") &&
            !file.path.includes(".git") &&
            !fs.lstatSync(folderPath).isDirectory()
        );
    });

    return await Promise.all(
        allJsFilesPaths.map((file) => {
            const filePath = path.join(cwd, file.path);
            return getDecoratorsFromFile(filePath).catch((error) => {
                if (error.reasonCode == "MissingOneOfPlugins") {
                    debugLogger.error(`Error while parsing the file ${file.path}`, error);
                    return [];
                } else {
                    throw error;
                }
            });
        }),
    );
}

export async function scanClassesForDecorators(
    yamlBackend: Pick<YAMLBackend, "path" | "classes">,
): Promise<YamlClass[]> {
    const result = await tryToReadClassInformationFromDecorators(yamlBackend);
    const classes: YamlClass[] = yamlBackend.classes || [];

    result.forEach((classInfo) => {
        if (classInfo.length < 1) {
            return;
        }
        if (Object.keys(classInfo[0]).length > 0) {
            const r = classes.find(
                (c) =>
                    path.resolve(path.join(yamlBackend.path, c.path)) ===
                    path.resolve(classInfo[0].path),
            );
            const deployDecoratorFound = classInfo[0].decorators.find(
                (d) => d.name === "GenezioDeploy",
            );

            if (!r && deployDecoratorFound) {
                let type = TriggerType.jsonrpc;
                const methods = classInfo[0].methods
                    .map((m) => {
                        const genezioMethodDecorator = m.decorators.find(
                            (d) => d.name === "GenezioMethod",
                        );

                        if (!genezioMethodDecorator || !genezioMethodDecorator.arguments) {
                            return undefined;
                        }

                        const methodType = genezioMethodDecorator.arguments["type"]
                            ? getTriggerTypeFromString(genezioMethodDecorator.arguments["type"])
                            : undefined;
                        const cronString = genezioMethodDecorator.arguments["cronString"];
                        return {
                            name: m.name,
                            type: methodType,
                            cronString: cronString,
                        } as YamlMethod;
                    })
                    .filter((m) => m !== undefined) as YamlMethod[];

                if (deployDecoratorFound.arguments) {
                    const classType = deployDecoratorFound.arguments["type"];
                    if (classType) {
                        type = getTriggerTypeFromString(classType);
                    }
                }

                classes.push({
                    name: classInfo[0].name,
                    path: path.relative(yamlBackend.path, classInfo[0].path),
                    type: type,
                    methods: methods,
                });
            }
        }
    });

    return classes;
}

export function getTriggerTypeFromString(string: string): TriggerType {
    if (string && !TriggerType[string as keyof typeof TriggerType]) {
        const triggerTypes: string = Object.keys(TriggerType).join(", ");
        throw new UserError(
            "Specified class type for " +
                string +
                " is incorrect. Accepted values: " +
                triggerTypes +
                ".",
        );
    }

    return TriggerType[string as keyof typeof TriggerType];
}
