import { log } from "../utils/logging.js";
import {
    mapYamlClassToSdkClassConfiguration,
    sdkGeneratorApiHandler,
} from "../generateSdk/generateSdkApi.js";
import { GenezioBundleOptions } from "../models/commandOptions.js";
import { SdkHandlerResponse } from "../models/sdkGeneratorResponse.js";
import { ProjectConfiguration } from "../models/projectConfiguration.js";
import { bundle } from "../bundlers/utils.js";
import { mkdirSync } from "fs";
import { writeToFile, zipDirectory } from "../utils/file.js";
import path from "path";
import yamlConfigIOController from "../projectConfiguration/yaml/v2.js";
import { scanClassesForDecorators } from "../utils/configuration.js";
import { UserError } from "../errors.js";
import {
    CloudAdapterIdentifier,
    CloudProviderIdentifier,
} from "../models/cloudProviderIdentifier.js";

export async function bundleCommand(options: GenezioBundleOptions) {
    const yamlProjectConfiguration = await yamlConfigIOController.read();
    const backendConfiguration = yamlProjectConfiguration.backend;
    if (!backendConfiguration) {
        throw new UserError("Please provide a valid backend configuration.");
    }
    backendConfiguration.classes = await scanClassesForDecorators(backendConfiguration);

    // Override cloud provider if it's set using command line args
    let cloudProvider: CloudProviderIdentifier = CloudProviderIdentifier.GENEZIO_CLOUD;
    switch (options.cloudAdapter) {
        case CloudAdapterIdentifier.AWS:
            cloudProvider = CloudProviderIdentifier.GENEZIO_AWS;
            break;
        case CloudAdapterIdentifier.RUNTIME:
            cloudProvider = CloudProviderIdentifier.GENEZIO_CLOUD;
            break;
        case CloudAdapterIdentifier.CLUSTER:
            cloudProvider = CloudProviderIdentifier.GENEZIO_CLUSTER;
            break;
    }

    const sdkResponse: SdkHandlerResponse = await sdkGeneratorApiHandler(
        [],
        mapYamlClassToSdkClassConfiguration(
            backendConfiguration.classes,
            backendConfiguration.language.name,
            backendConfiguration.path,
        ),
        backendConfiguration.path,
        /* packageName= */ `@genezio-sdk/${yamlProjectConfiguration.name}`,
    ).catch((error) => {
        // TODO: this is not very generic error handling. The SDK should throw Genezio errors, not babel.
        if (error.code === "BABEL_PARSER_SYNTAX_ERROR") {
            log.error("Syntax error:");
            log.error(`Reason Code: ${error.reasonCode}`);
            log.error(`File: ${error.path}:${error.loc.line}:${error.loc.column}`);
        }

        throw error;
    });

    yamlProjectConfiguration.backend = backendConfiguration;
    const projectConfiguration = new ProjectConfiguration(
        yamlProjectConfiguration,
        cloudProvider,
        sdkResponse,
    );
    const element = projectConfiguration.classes.find(
        (classInfo) => classInfo.name == options.className,
    );

    if (!element) {
        throw new UserError(`Class ${options.className} not found.`);
    }

    const ast = sdkResponse.classesInfo.find(
        (classInfo) => classInfo.classConfiguration.path === element.path,
    )!.program;

    const result = await bundle(projectConfiguration, ast, element, options.disableOptimization);
    mkdirSync(options.output, { recursive: true });
    await zipDirectory(result.path, path.join(options.output, "bundle.zip"));
    writeToFile(options.output, "bundle.ast", JSON.stringify(result.configuration));
}
