import log from "loglevel";
import { SdkGeneratorResponse } from "../models/sdkGeneratorResponse.js";
import { TriggerType } from "../models/yamlProjectConfiguration.js";
import { GenezioCloudResultClass } from "../cloudAdapter/cloudAdapter.js";
import colors from "colors";
import boxen from "boxen";
import packageManager from "../packageManagers/packageManager.js";

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
    sdkResponse: SdkGeneratorResponse,
    command: GenezioCommand,
    projectConfiguration: ProjectPrimaryKeys,
    newVersion: boolean,
) {
    if (command === GenezioCommand.deploy) {
        if (sdkResponse.files.length > 0) {
            log.info(
                "\x1b[36m%s\x1b[0m",
                "Your code was deployed and the SDK was successfully generated!",
            );

            if (newVersion) {
                log.info(
                    boxen(
                        `${colors.green(
                            "To install the SDK in your client, run this command in your client's root:",
                        )}\n${colors.magenta(
                            `${packageManager.command} add @genezio-sdk/${projectConfiguration.name}_${projectConfiguration.region}@1.0.0-${projectConfiguration.stage}`,
                        )}\n\n${colors.green(
                            "Then import your classes like this:",
                        )}\n${colors.magenta(
                            `import { ${classesInfo[0].className} } from "@genezio-sdk/${projectConfiguration.name}_${projectConfiguration.region}"`,
                        )}`,
                        {
                            padding: 1,
                            margin: 1,
                            borderStyle: "round",
                            borderColor: "magentaBright",
                        },
                    ),
                );
            }
        } else {
            log.info("\x1b[36m%s\x1b[0m", "Your code was successfully deployed!");
        }
    } else {
        if (sdkResponse.files.length > 0) {
            log.info(
                "\x1b[36m%s\x1b[0m",
                "Your local server is running and the SDK was successfully generated!",
            );
            if (newVersion) {
                log.info(
                    boxen(
                        `${colors.green("Import your classes like this:")}\n${colors.magenta(
                            `import { ${classesInfo[0].className} } from "@genezio-sdk/${projectConfiguration.name}_${projectConfiguration.region}"`,
                        )}`,
                        {
                            padding: 1,
                            margin: 1,
                            borderStyle: "round",
                            borderColor: "magentaBright",
                        },
                    ),
                );
            }
        } else {
            log.info("\x1b[36m%s\x1b[0m", "Your local server is running!");
        }
        log.info(colors.red("When working with a frontend, make sure to launch it locally!"));
        log.info(
            `If you are using one of our frontend templates, run ${colors.green(
                "npm install",
            )} followed by ${colors.green("npm run dev")} in your frontend's root folder.\n`,
        );
    }

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
