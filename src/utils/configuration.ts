import path from "path";
import { createRequire } from "module";
import {
    TriggerType,
    YamlClassConfiguration,
    YamlMethodConfiguration,
    YamlProjectConfiguration,
    getTriggerTypeFromString,
} from "../models/yamlProjectConfiguration.js";
import { checkYamlFileExists, getAllFilesFromPath, readUTF8File } from "./file.js";
import { parse } from "yaml";
import babel from "@babel/core";
import fs from "fs";
import FileDetails from "../models/fileDetails.js";
import { debugLogger } from "./logging.js";

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

function parseArguments(args: any): { [key: string]: string } {
    if (!args) {
        return {};
    }

    return args
        .map((a: any) => {
            if (a.type === "ObjectExpression") {
                return a.properties.reduce((acc: any, curr: any) => {
                    return [...acc, { key: curr.key.name, value: curr.value.value }];
                }, []);
            } else {
                throw new Error("Unsupported argument for decorator");
            }
        })
        .flat()
        .reduce((acc: any, curr: any) => {
            acc[curr["key"]] = curr["value"];
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
                ClassDeclaration(path: any) {
                    if (path.node.decorators) {
                        const info: ClassInfo = {
                            path: file,
                            name: path.node.id.name,
                            decorators: [],
                            methods: [],
                        };
                        for (const decorator of path.node.decorators) {
                            if (decorator.expression.type === "Identifier") {
                                info.decorators = [
                                    ...(info.decorators ?? []),
                                    { name: decorator.expression.name },
                                ];
                            } else if (decorator.expression.type === "CallExpression") {
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
                ClassMethod(path: any) {
                    if (path.node.decorators) {
                        const className = path.context.parentPath.container.id.name;
                        const methodName = path.node.key.name;
                        for (const decorator of path.node.decorators) {
                            const info: MethodInfo = {
                                name: methodName,
                                decorators: [],
                            };
                            let existingClass = classes.find((c) => c.name === className);
                            if (!existingClass) {
                                existingClass = {
                                    path: file,
                                    name: path.node.id.name,
                                    decorators: [] as any,
                                    methods: [],
                                };
                                classes.push(existingClass);
                            }

                            if (decorator.expression.type === "Identifier") {
                                info.decorators = [
                                    ...(info.decorators ?? []),
                                    { name: decorator.expression.name },
                                ];
                            } else if (decorator.expression.type === "CallExpression") {
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
    });

    return classes;
}

async function tryToReadClassInformationFromDecorators(
    projectConfiguration: YamlProjectConfiguration,
) {
    const cwd = projectConfiguration.workspace?.backend || process.cwd();

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

export async function getProjectConfiguration(
    configurationFilePath = "./genezio.yaml",
): Promise<YamlProjectConfiguration> {
    if (!(await checkYamlFileExists(configurationFilePath))) {
        throw new Error("The configuration file does not exist.");
    }

    const genezioYamlPath = path.join(configurationFilePath);
    const configurationFileContentUTF8 = await readUTF8File(genezioYamlPath);
    let configurationFileContent = null;

    try {
        configurationFileContent = await parse(configurationFileContentUTF8);
    } catch (error) {
        throw new Error(`The configuration yaml file is not valid.\n${error}`);
    }

    const projectConfiguration = await YamlProjectConfiguration.create(configurationFileContent);

    const result = await tryToReadClassInformationFromDecorators(projectConfiguration);

    result.forEach((classInfo) => {
        if (classInfo.length < 1) {
            return;
        }
        if (Object.keys(classInfo[0]).length > 0) {
            const r = projectConfiguration.classes.find(
                (c) => path.resolve(c.path) === path.resolve(classInfo[0].path),
            );
            const deployDecoratorFound = classInfo[0].decorators.find(
                (d: any) => d.name === "GenezioDeploy",
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
                            : TriggerType.jsonrpc;
                        const cronString = genezioMethodDecorator.arguments["cronString"];
                        return new YamlMethodConfiguration(m.name, methodType, cronString);
                    })
                    .filter((m) => m !== undefined) as YamlMethodConfiguration[];

                if (deployDecoratorFound.arguments) {
                    const classType = deployDecoratorFound.arguments["type"];
                    if (classType) {
                        type = getTriggerTypeFromString(classType);
                    }
                }

                projectConfiguration.classes.push(
                    new YamlClassConfiguration(
                        classInfo[0].path,
                        type,
                        ".js",
                        methods,
                        undefined,
                        true,
                    ),
                );
            }
        }
    });

    return projectConfiguration;
}
