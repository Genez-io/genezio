import { log } from "../utils/logging.js";
import { TriggerType } from "../yamlProjectConfiguration/models.js";
import { GenezioCloudResultClass } from "../cloudAdapter/cloudAdapter.js";
import colors from "colors";

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
