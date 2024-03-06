import log from "loglevel";
import { TriggerType } from "../yamlProjectConfiguration/models.js";
import { GenezioCloudResultClass } from "../cloudAdapter/cloudAdapter.js";

export enum GenezioCommand {
    deploy = "deploy",
    local = "local",
}

export type ProjectPrimaryKeys = {
    name: string;
    region: string;
    stage?: string;
};

export function reportSuccess(
    classesInfo: GenezioCloudResultClass[],
) {
    // print function urls
    let printHttpString = "";

    classesInfo.forEach((classInfo) => {
        classInfo.methods.forEach((method) => {
            if (method.type === TriggerType.http) {
                printHttpString +=
                    `  - ${classInfo.className}.${method.name}: ${method.functionUrl}` + "\n";
            }
        });
    });

    if (printHttpString !== "") {
        log.info("");
        log.info("HTTP Methods Deployed:");
        log.info(printHttpString);
    }
}
