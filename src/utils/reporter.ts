import { log } from "../utils/logging.js";
import { TriggerType } from "../projectConfiguration/yaml/models.js";
import { GenezioCloudResultClass } from "../cloudAdapter/cloudAdapter.js";
import colors from "colors";
import { DeployCodeFunctionResponse } from "../models/deployCodeResponse.js";

export enum GenezioCommand {
    deploy = "deploy",
    local = "local",
    sdk = "sdk",
}

export type ProjectPrimaryKeys = {
    name: string;
    stage?: string;
};

export function reportSuccess(classesInfo: GenezioCloudResultClass[]) {
    // print function urls
    let printHttpString = "";

    classesInfo.forEach((classInfo) => {
        classInfo.methods.forEach((method) => {
            if (method.type === TriggerType.http) {
                printHttpString +=
                    `  - ${classInfo.className}.${method.name}: ${colors.yellow(method.functionUrl)}` +
                    "\n";
            }
        });
    });

    if (printHttpString !== "") {
        log.info("");
        log.info("HTTP Methods Deployed:");
        log.info(printHttpString);
    }
}

export function reportSuccessFunctions(functions: DeployCodeFunctionResponse[]) {
    let functionDeploymentsString = "";

    functions.forEach((func) => {
        functionDeploymentsString += `  - ${func.name}: ${colors.yellow(func.cloudUrl)}` + "\n";
    });

    if (functionDeploymentsString !== "") {
        log.info("");
        log.info("Functions Deployed:");
        log.info(functionDeploymentsString);
    }
}
