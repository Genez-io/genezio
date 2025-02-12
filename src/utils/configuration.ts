import path from "path";
import { YAMLBackend, YamlClass, YamlMethod } from "../projectConfiguration/yaml/v2.js";
import { getAllFilesFromPath } from "./file.js";
import { debugLogger, log } from "./logging.js";
import { InstanceSize, TriggerType } from "../projectConfiguration/yaml/models.js";
import { GENEZIO_DECORATOR_YAML_OVERLAP, UserError } from "../errors.js";
import { DecoratorExtractorFactory } from "./decorators/decoratorFactory.js";

async function tryToReadClassInformationFromDecorators(
    yamlBackend: Pick<YAMLBackend, "path" | "classes"> & {
        language: Pick<YAMLBackend["language"], "name">;
    },
) {
    const cwd = yamlBackend.path || process.cwd();

    const decoratorExtractor = DecoratorExtractorFactory.createExtractor(yamlBackend.language.name);

    const allFilesPaths = (await getAllFilesFromPath(cwd)).filter(
        decoratorExtractor.fileFilter(cwd),
    );

    return await Promise.all(
        allFilesPaths.map((file) => {
            const filePath = path.join(cwd, file.path);
            return decoratorExtractor.getDecoratorsFromFile(filePath, cwd);
        }),
    );
}

export async function scanClassesForDecorators(
    yamlBackend: Pick<YAMLBackend, "path" | "classes"> & {
        language: Pick<YAMLBackend["language"], "name">;
    },
): Promise<YamlClass[]> {
    const result = await tryToReadClassInformationFromDecorators(yamlBackend).catch((error) => {
        if (error instanceof UserError && error.message.includes("Language not supported")) {
            debugLogger.debug("Language decorators not supported, skipping scan for decorators.");
        } else if (error instanceof UserError) {
            throw error;
        }
        return [];
    });
    const classes: YamlClass[] = yamlBackend.classes || [];

    const overlappingYamlClasses: string[] = [];
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
                let timeout: number | undefined;
                let storageSize: number | undefined;
                let instanceSize: InstanceSize | undefined;
                let vcpuCount: number | undefined;
                let memoryMb: number | undefined;
                let maxConcurrentRequestsPerInstance: number | undefined;
                let maxConcurrentInstances: number | undefined;
                let cooldownTime: number | undefined;
                let persistent: boolean | undefined;
                const methods = classInfo[0].methods
                    .map((m) => {
                        const genezioMethodDecorator = m.decorators.find(
                            (d) => d.name === "GenezioMethod",
                        );

                        if (!genezioMethodDecorator || !genezioMethodDecorator.arguments) {
                            return undefined;
                        }

                        const methodType = genezioMethodDecorator.arguments["type"]
                            ? getTriggerTypeFromString(
                                  genezioMethodDecorator.arguments["type"] as string,
                              )
                            : undefined;
                        const cronString = genezioMethodDecorator.arguments["cronString"];
                        if (methodType === TriggerType.cron && !cronString) {
                            throw new UserError(
                                `Method ${m.name} in class ${classInfo[0].name} has type cron but no cronString specified`,
                            );
                        }

                        const usesAuth =
                            m.decorators.find((d) => d.name === "GenezioAuth") !== undefined;
                        return {
                            name: m.name,
                            type: methodType,
                            cronString: cronString,
                            auth: usesAuth,
                        } as YamlMethod;
                    })
                    .filter((m) => m !== undefined) as YamlMethod[];

                if (deployDecoratorFound.arguments) {
                    const classType = deployDecoratorFound.arguments["type"] as string;
                    if (classType) {
                        type = getTriggerTypeFromString(classType);
                    }

                    timeout = deployDecoratorFound.arguments["timeout"] as number | undefined;
                    storageSize = deployDecoratorFound.arguments["storageSize"] as
                        | number
                        | undefined;
                    instanceSize = deployDecoratorFound.arguments["instanceSize"] as
                        | InstanceSize
                        | undefined;
                    vcpuCount = deployDecoratorFound.arguments["vcpuCount"] as number | undefined;
                    memoryMb = deployDecoratorFound.arguments["memoryMb"] as number | undefined;
                    maxConcurrentRequestsPerInstance = deployDecoratorFound.arguments[
                        "maxConcurrentRequestsPerInstance"
                    ] as number | undefined;
                    maxConcurrentInstances = deployDecoratorFound.arguments[
                        "maxConcurrentInstances"
                    ] as number | undefined;
                    cooldownTime = deployDecoratorFound.arguments["cooldownTime"] as
                        | number
                        | undefined;
                    persistent = deployDecoratorFound.arguments["persistent"] as
                        | boolean
                        | undefined;
                }

                classes.push({
                    name: classInfo[0].name,
                    path: path.relative(yamlBackend.path, classInfo[0].path),
                    type: type,
                    timeout: timeout,
                    storageSize: storageSize,
                    instanceSize: instanceSize as InstanceSize,
                    vcpuCount: vcpuCount,
                    memoryMb: memoryMb,
                    maxConcurrentRequestsPerInstance: maxConcurrentRequestsPerInstance,
                    maxConcurrentInstances: maxConcurrentInstances,
                    cooldownTime: cooldownTime,
                    persistent: persistent,
                    methods: methods,
                });
            } else if (r && deployDecoratorFound) {
                overlappingYamlClasses.push(r?.name || "");
            }
        }
    });

    if (overlappingYamlClasses.length > 0) {
        log.warn(GENEZIO_DECORATOR_YAML_OVERLAP(overlappingYamlClasses));
    }
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
