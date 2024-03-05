import { log } from "../utils/logging.js";
import {
    SdkTypeMetadata,
    mapYamlClassToSdkClassConfiguration,
    sdkGeneratorApiHandler,
} from "../generateSdk/generateSdkApi.js";
import { GenezioBundleOptions } from "../models/commandOptions.js";
import { SdkGeneratorResponse } from "../models/sdkGeneratorResponse.js";
import { ProjectConfiguration } from "../models/projectConfiguration.js";
import { bundle } from "../bundlers/utils.js";
import { mkdirSync } from "fs";
import { writeToFile, zipDirectory } from "../utils/file.js";
import path from "path";
import yamlConfigIOController from "../yamlProjectConfiguration/v2.js";
import { scanClassesForDecorators } from "../utils/configuration.js";
import { SdkType } from "../yamlProjectConfiguration/models.js";

export async function bundleCommand(options: GenezioBundleOptions) {
    const yamlProjectConfiguration = await yamlConfigIOController.read();
    const backendConfiguration = yamlProjectConfiguration.backend;
    if (!backendConfiguration) {
        throw new Error("Please provide a valid backend configuration.");
    }
    backendConfiguration.classes = await scanClassesForDecorators(backendConfiguration);

    let metadata: SdkTypeMetadata;
    if (backendConfiguration.sdk?.type === SdkType.folder) {
        metadata = {
            type: SdkType.folder,
        };
    } else {
        metadata = {
            type: SdkType.package,
            projectName: yamlProjectConfiguration.name,
            region: yamlProjectConfiguration.region,
        };
    }

    const sdkResponse: SdkGeneratorResponse = await sdkGeneratorApiHandler(
        metadata,
        backendConfiguration.language.name,
        mapYamlClassToSdkClassConfiguration(
            backendConfiguration.classes,
            backendConfiguration.language.name,
            backendConfiguration.path,
        ),
        backendConfiguration.path,
    ).catch((error) => {
        // TODO: this is not very generic error handling. The SDK should throw Genezio errors, not babel.
        if (error.code === "BABEL_PARSER_SYNTAX_ERROR") {
            log.error("Syntax error:");
            log.error(`Reason Code: ${error.reasonCode}`);
            log.error(`File: ${error.path}:${error.loc.line}:${error.loc.column}`);
        }

        throw error;
    });

    const projectConfiguration = new ProjectConfiguration(yamlProjectConfiguration, sdkResponse);
    const element = projectConfiguration.classes.find(
        (classInfo) => classInfo.name == options.className,
    );

    if (!element) {
        throw new Error(`Class ${options.className} not found.`);
    }

    const ast = sdkResponse.sdkGeneratorInput.classesInfo.find(
        (classInfo) => classInfo.classConfiguration.path === element.path,
    )!.program;

    const result = await bundle(projectConfiguration, ast, element);
    mkdirSync(options.output, { recursive: true });
    await zipDirectory(result.path, path.join(options.output, "bundle.zip"));
    writeToFile(options.output, "bundle.ast", JSON.stringify(result.configuration));
}
