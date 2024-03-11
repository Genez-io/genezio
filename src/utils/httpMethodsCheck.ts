import { ClassConfiguration } from "../models/projectConfiguration.js";

export function getHttpMethodsWithWrongReturnType(classes: ClassConfiguration[]) {
    let returnTypes = [];
    for (let i = 0; i < classes.length; i++) {
        const methods = classes[i].methods;
        for (let j = 0; j < methods.length; j++) {
            const currentMethod = methods[j];
            if (currentMethod.type == "http") {
                returnTypes.push(currentMethod.returnType);
            }
        }
    }
    return returnTypes;
}
