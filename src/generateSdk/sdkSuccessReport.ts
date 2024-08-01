import { log } from "../utils/logging.js";
import { GenezioCommand, ProjectPrimaryKeys } from "../utils/reporter.js";
import { SdkGeneratorResponse } from "../models/sdkGeneratorResponse.js";
import colors from "colors";
import boxen from "boxen";
import { getPackageManager } from "../packageManagers/packageManager.js";
import { Language, TriggerType } from "../projectConfiguration/yaml/models.js";
import { UserError } from "../errors.js";

export function reportSuccessForSdk(
    language: Language,
    sdkResponse: SdkGeneratorResponse,
    command: GenezioCommand,
    projectConfiguration?: ProjectPrimaryKeys,
) {
    switch (language) {
        case Language.ts:
        case Language.js:
            return reportSuccessForSdkJs(sdkResponse, command, projectConfiguration);
        case Language.go:
        case Language.kt:
        case Language.dart:
        case Language.swift:
        case Language.python:
            return reportSuccessForSdkOtherLanguages();
            return;
        default:
            throw new UserError("Language not supported");
    }
}

export function reportSuccessForSdkOtherLanguages() {
    log.info("Your SDK has been generated successfully");
}

export function reportSuccessForSdkJs(
    sdkResponse: SdkGeneratorResponse,
    command: GenezioCommand,
    projectConfiguration?: ProjectPrimaryKeys,
) {
    const className = sdkResponse.sdkGeneratorInput.classesInfo.find(
        (c) => c.classConfiguration.type === TriggerType.jsonrpc,
    )?.classConfiguration.name;

    // No JSON RPC class means that no SDK was generated. We can skip
    // all the info regarding SDK.
    if (!className) {
        return;
    }

    if (command === GenezioCommand.deploy) {
        log.info(
            boxen(
                `${colors.green(
                    "To install the SDK in your client, run this command in your client's root:",
                )}\n${colors.magenta(
                    `${getPackageManager().command} add @genezio-sdk/${projectConfiguration!.name}@1.0.0-${projectConfiguration!.stage}`,
                )}\n\n${colors.green("Then import your classes like this:")}\n${colors.magenta(
                    `import { ${className} } from "@genezio-sdk/${projectConfiguration!.name}"`,
                )}`,
                {
                    padding: 1,
                    margin: 1,
                    borderStyle: "round",
                    borderColor: "magentaBright",
                },
            ),
        );
    } else if (command === GenezioCommand.local) {
        log.info(
            boxen(
                `${colors.green("Import your classes like this:")}\n${colors.magenta(
                    `import { ${className} } from "@genezio-sdk/${projectConfiguration!.name}"`,
                )}`,
                {
                    padding: 1,
                    margin: 1,
                    borderStyle: "round",
                    borderColor: "magentaBright",
                },
            ),
        );
    } else {
        log.info("Your SDK has been generated successfully");
        log.info(
            `You can now publish it to npm using ${colors.cyan(
                `'npm publish'`,
            )} in the sdk directory or use it locally in your project using ${colors.cyan(
                `'npm link'`,
            )}`,
        );
    }
}
