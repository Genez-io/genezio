import log from "loglevel";
import { sdkGeneratorApiHandler } from "../generateSdk/generateSdkApi.js";
import { GenezioBundleOptions } from "../models/commandOptions.js";
import { SdkGeneratorResponse } from "../models/sdkGeneratorResponse.js";
import { getProjectConfiguration } from "../utils/configuration.js";
import { ProjectConfiguration } from "../models/projectConfiguration.js";
import { bundle } from "../bundlers/utils.js";
import { mkdirSync } from "fs";
import { writeToFile, zipDirectory } from "../utils/file.js";
import path from "path";

export async function bundleCommand(options: GenezioBundleOptions) {
        const yamlProjectConfiguration = await getProjectConfiguration("./genezio.yaml");

        const sdkResponse: SdkGeneratorResponse = await sdkGeneratorApiHandler(yamlProjectConfiguration).catch(
            (error) => {
                // TODO: this is not very generic error handling. The SDK should throw Genezio errors, not babel.
                if (error.code === "BABEL_PARSER_SYNTAX_ERROR") {
                    log.error("Syntax error:");
                    log.error(`Reason Code: ${error.reasonCode}`);
                    log.error(`File: ${error.path}:${error.loc.line}:${error.loc.column}`);
                }

                throw error;
            },
        );

        const projectConfiguration = new ProjectConfiguration(yamlProjectConfiguration, sdkResponse);
        const element = projectConfiguration.classes.find((classInfo) => classInfo.name == options.className)

        if (!element) {
            throw new Error(`Class ${options.className} not found.`);
        }

        const ast = sdkResponse.sdkGeneratorInput.classesInfo.find(
            (classInfo) => classInfo.classConfiguration.path === element.path,
        )!.program;

        const result = await bundle(projectConfiguration, ast, element);
        mkdirSync(options.output, { recursive: true })
        await zipDirectory(result.path, path.join(options.output, "bundle.zip"));
        writeToFile(options.output, "bundle.ast", JSON.stringify(result.configuration));
}

