import { AstSummaryClass, AstSummaryMethod, AstSummaryParam } from "../../models/astSummary.js";
import {
    ClassDefinition,
    MethodDefinition,
    Node,
    ParameterDefinition,
    SdkGeneratorClassesInfoInput,
} from "../../models/genezioModels.js";
import { TriggerType } from "../../projectConfiguration/yaml/models.js";

export function getAstSummary(classesInfo: SdkGeneratorClassesInfoInput[]): AstSummaryClass[] {
    const classes: AstSummaryClass[] = classesInfo
        .filter((classConfiguration: SdkGeneratorClassesInfoInput) => {
            const body: (ClassDefinition | Node)[] | undefined = classConfiguration.program.body;
            // filter if body is undefined
            if (body === undefined) {
                return false;
            }
            return true;
        })
        .map((classConfiguration: SdkGeneratorClassesInfoInput) => {
            const body: (ClassDefinition | Node)[] | undefined = classConfiguration.program.body;

            // get the class definition
            const classElem: ClassDefinition = body?.find((elem) => {
                return elem.type === "ClassDefinition";
            }) as ClassDefinition;

            // get the types
            const types: Node[] =
                body?.filter((elem) => {
                    return elem.type !== "ClassDefinition";
                }) || [];

            const methods: AstSummaryMethod[] = classElem.methods.map(
                (method: MethodDefinition) => {
                    const params: AstSummaryParam[] = method.params.map(
                        (param: ParameterDefinition) => {
                            return {
                                name: param.name,
                                type: param.paramType,
                                optional: param.optional,
                            };
                        },
                    );

                    const methodConfiguration = classConfiguration.classConfiguration.methods.find(
                        (m) => m.name === method.name,
                    );

                    const methodInfo: AstSummaryMethod = {
                        name: method.name,
                        type:
                            methodConfiguration?.type ||
                            classConfiguration.classConfiguration.type ||
                            TriggerType.jsonrpc,
                        params: params,
                        docString: method.docString,
                        returnType: method.returnType,
                    };
                    return methodInfo;
                },
            );

            const classInfo: AstSummaryClass = {
                name: classElem.name,
                path: classConfiguration.classConfiguration.path,
                language: classConfiguration.classConfiguration.language,
                methods: methods,
                types: types,
                docString: classElem.docString,
                timeout: classConfiguration.classConfiguration.timeout,
                storageSize: classConfiguration.classConfiguration.storageSize,
                instanceSize: classConfiguration.classConfiguration.instanceSize,
                maxConcurrentRequestsPerInstance:
                    classConfiguration.classConfiguration.maxConcurrentRequestsPerInstance,
                maxConcurrentInstances:
                    classConfiguration.classConfiguration.maxConcurrentInstances,
                cooldownTime: classConfiguration.classConfiguration.cooldownTime,
                persistent: classConfiguration.classConfiguration.persistent,
            };
            return classInfo;
        });
    return classes;
}
