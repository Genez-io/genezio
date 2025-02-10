import { UserError } from "../../errors.js";
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
        // Example of a comment: "// genezio: deploy jsonrpc; timeout: 3; storageSize: 256"
        const genezioDeployArguments = commentText
            .split("genezio: deploy")[1]
            .split(" ")
            .filter((arg) => arg !== "");

        const args = commentText.split(";");
        let parsedArgs: { key: string; value: string | number }[] = [];
        if (args && args.length > 1) {
            parsedArgs = args.slice(1).map((arg) => {
                const [key, value] = arg.split(":").map((el) => el.trim());
                let transformedValue: string | number = value;

                // These configuration values should be numbers
                if (
                    key === "timeout" ||
                    key === "storageSize" ||
                    key === "maxConcurrentRequestsPerInstance" ||
                    key === "maxConcurrentInstances" ||
                    key === "cooldownTime" ||
                    key === "persistent"
                ) {
                    transformedValue = parseInt(value);
                    if (isNaN(transformedValue)) {
                        throw new UserError(
                            `Error parsing the value of the argument ${key}. The value should be a number.`,
                        );
                    }
                }

                return { key: key, value: transformedValue };
            });
        }

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

        const otherArgs = parsedArgs.reduce(
            (acc, arg) => {
                acc[arg.key] = arg.value;
                return acc;
            },
            {} as Record<string, string | number>,
        );

        const classInfo: ClassInfo = {
            path: file,
            name: className,
            decorators: [
                {
                    name: "GenezioDeploy",
                    arguments: {
                        type: classType,
                        ...otherArgs,
                    },
                },
            ],
            methods: [],
        };
        return classInfo;
    }
}
