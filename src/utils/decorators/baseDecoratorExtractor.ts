import FileDetails from "../../models/fileDetails.js";
import { ClassInfo, MethodInfo } from "./decoratorTypes.js";

export abstract class DecoratorExtractor {
    abstract getDecoratorsFromFile(file: string): Promise<ClassInfo[]>;
    abstract fileFilter(cwd: string): (file: FileDetails) => boolean;

    createGenezioMethodInfo(methodName: string, commentText: string): MethodInfo | undefined {
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
        return methodInfo;
    }

    createGenezioClassInfo(className: string, file: string, commentText: string): ClassInfo {
        const genezioDeployArguments = commentText
            .split("genezio: deploy")[1]
            .split(" ")
            .filter((arg) => arg !== "");
        let classType: string = "jsonrpc";
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
