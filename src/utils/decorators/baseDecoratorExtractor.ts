import FileDetails from "../../models/fileDetails.js";
import { ClassInfo, MethodInfo } from "./decoratorTypes.js";

export abstract class DecoratorExtractor {
    abstract getDecoratorsFromFile(file: string, cwd?: string): Promise<ClassInfo[]>;
    abstract fileFilter(cwd: string): (file: FileDetails) => boolean;

    static createGenezioMethodInfo(
        methodName: string,
        commentText: string,
    ): MethodInfo | undefined {
        const genezioMethodArguments = commentText
            .split("genezio:")[1]
            .split(" ")
            .filter((arg) => arg !== "");

        if (genezioMethodArguments.length < 1) {
            return {
                name: methodName,
                decorators: [
                    {
                        name: "GenezioMethod",
                        arguments: {
                            type: "jsonrpc",
                        },
                    },
                ],
            };
        }
        let decoratorArguments = {};
        let auth = false;
        if (genezioMethodArguments[0] === "auth") {
            auth = true;
            genezioMethodArguments.shift();
        }
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
                    cronString: genezioMethodArguments.slice(1).join(" "),
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
        const methodInfo: MethodInfo = {
            name: methodName,
            decorators: [
                {
                    name: "GenezioMethod",
                    arguments: decoratorArguments,
                },
            ],
        };
        if (auth) {
            methodInfo.decorators.push({
                name: "GenezioAuth",
                arguments: {},
            });
        }
        return methodInfo;
    }

    static createGenezioClassInfo(className: string, file: string, commentText: string): ClassInfo {
        const genezioDeployArguments = commentText
            .split("genezio: deploy")[1]
            .split(" ")
            .filter((arg) => arg !== "");
        let classType: string = "jsonrpc";
        if (genezioDeployArguments.length > 0) {
            switch (genezioDeployArguments[0]) {
                case "http": {
                    classType = "http";
                    break;
                }
                case "cron": {
                    classType = "cron";
                    break;
                }
            }
        }

        const classInfo: ClassInfo = {
            path: file,
            name: className,
            decorators: [
                {
                    name: "GenezioDeploy",
                    arguments: {
                        type: classType,
                    },
                },
            ],
            methods: [],
        };
        return classInfo;
    }
}
