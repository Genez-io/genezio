import { log } from "../utils/logging.js";
import { exit } from "process";
import { languages } from "../utils/languages.js";
import { Language, TriggerType } from "../projectConfiguration/yaml/models.js";
import { getProjectEnvFromProject } from "../requests/getProjectInfo.js";
import listProjects from "../requests/listProjects.js";
import { scanClassesForDecorators } from "../utils/configuration.js";
import { ClassUrlMap } from "../utils/sdk.js";
import { GenezioTelemetry, TelemetryEventTypes } from "../telemetry/telemetry.js";
import path from "path";
import { SdkGeneratorClassesInfoInput, SdkGeneratorInput } from "../models/genezioModels.js";
import { mapDbAstToSdkGeneratorAst } from "../generateSdk/utils/mapDbAstToFullAst.js";
import { generateSdk } from "../generateSdk/sdkGeneratorHandler.js";
import { SdkGeneratorResponse, SdkHandlerResponse } from "../models/sdkGeneratorResponse.js";
import inquirer from "inquirer";
import { GenezioSdkOptions, SourceType } from "../models/commandOptions.js";
import {
    mapYamlClassToSdkClassConfiguration,
    sdkGeneratorApiHandler,
} from "../generateSdk/generateSdkApi.js";
import { YamlConfigurationIOController } from "../projectConfiguration/yaml/v2.js";
import { writeSdk } from "../generateSdk/sdkWriter/sdkWriter.js";
import { reportSuccessForSdk } from "../generateSdk/sdkSuccessReport.js";
import { GenezioCommand } from "../utils/reporter.js";
import { UserError } from "../errors.js";
import fs from "fs";

export async function generateSdkCommand(projectName: string, options: GenezioSdkOptions) {
    switch (options.source) {
        case SourceType.LOCAL:
            await generateLocalSdkCommand(options);
            break;
        case SourceType.REMOTE:
            await generateRemoteSdkCommand(projectName, options);
            break;
    }
}

function inferProjectLanguage(): Language {
    if (fs.existsSync("package.json")) {
        return Language.ts;
    } else if (fs.existsSync("go.mod")) {
        return Language.go;
    }
    return Language.ts;
}

export async function generateLocalSdkCommand(options: GenezioSdkOptions) {
    const url = options.url;
    if (!url) {
        throw new UserError("You must provide a url when generating a local SDK.");
    }

    const sdk: SdkHandlerResponse = await sdkGeneratorApiHandler(
        [options.language],
        mapYamlClassToSdkClassConfiguration(
            await scanClassesForDecorators({
                path: process.cwd(),
                classes: [],
                language: {
                    name: inferProjectLanguage(),
                },
            }),
            options.language,
            process.cwd(),
        ),
        options.output,
        options.packageName,
    ).catch((error) => {
        // TODO: this is not very generic error handling. The SDK should throw Genezio errors, not babel.
        if (error.code === "BABEL_PARSER_SYNTAX_ERROR") {
            log.error("Syntax error:");
            log.error(`Reason Code: ${error.reasonCode}`);
            log.error(`File: ${error.path}:${error.loc.line}:${error.loc.column}`);

            throw error;
        }

        throw error;
    });

    const sdkResponse = sdk.generatorResponses[0];
    const classUrls = sdkResponse.files.map((c) => ({
        name: c.className,
        cloudUrl: url,
    }));
    await writeSdk({
        language: options.language,
        packageName: options.packageName,
        packageVersion: options.packageVersion,
        sdkResponse,
        classUrls,
        publish: false,
        installPackage: false,
        outputPath: options.output,
        exportAsTarball: options.tarball,
    });

    reportSuccessForSdk(options.language, sdkResponse, GenezioCommand.sdk);
}

export async function generateRemoteSdkCommand(projectName: string, options: GenezioSdkOptions) {
    await GenezioTelemetry.sendEvent({
        eventType: TelemetryEventTypes.GENEZIO_GENERATE_SDK,
        commandOptions: JSON.stringify(options),
    });

    const language = options.language;
    const sdkPath = options.output;
    const stage = options.stage;
    const region = options.region;

    // check if language is supported using languages array
    if (!languages.includes(language)) {
        throw new UserError(
            `The language you specified is not supported. Please use one of the following: ${languages}.`,
        );
    }

    if (projectName) {
        await generateRemoteSdkHandler(
            language,
            sdkPath,
            projectName,
            stage,
            region,
            options.packageName,
            options.packageVersion,
        );
    } else {
        let config = options.config;
        // check if path ends in .genezio.yaml or else append it
        if (!config.endsWith("genezio.yaml")) {
            config = path.join(config, "genezio.yaml");
        }
        let configuration;
        const yamlIOController = new YamlConfigurationIOController(config, {
            stage: options.stage,
        });
        try {
            configuration = await yamlIOController.read();
        } catch (error) {
            if (
                error instanceof Error &&
                error.message === "The configuration file does not exist."
            ) {
                const answers: { createConfig: string } = await inquirer.prompt([
                    {
                        type: "confirm",
                        name: "createConfig",
                        message:
                            "Oops! The configuration file does not exist at the specified path. Do you want us to create one for you?",
                    },
                ]);
                if (answers["createConfig"]) {
                    const projects = await listProjects();
                    const options = [
                        ...new Set(
                            projects.map((p) => ({
                                name: p.name,
                                region: p.region,
                            })),
                        ),
                    ].map((p) => ({
                        name: `${p.name} (${p.region})`,
                        value: p,
                    }));
                    const answers: { project: { name: string; region: string } } =
                        await inquirer.prompt([
                            {
                                type: "list",
                                name: "project",
                                message: "Select the project you want to generate the SDK for:",
                                choices: options,
                            },
                        ]);

                    const project = answers["project"];
                    configuration = {
                        name: project.name,
                        region: project.region,
                        yamlVersion: 2,
                    };
                    yamlIOController.write(configuration);
                } else {
                    exit(1);
                }
            } else {
                throw error;
            }
        }
        const name = configuration.name;
        const configurationRegion = configuration.region;

        await generateRemoteSdkHandler(
            language,
            sdkPath,
            name,
            stage,
            configurationRegion,
            options.packageName,
            options.packageVersion,
        );
    }
}

async function generateRemoteSdkHandler(
    language: Language,
    sdkPath: string,
    projectName: string,
    stage: string,
    region: string,
    packageName?: string,
    packageVersion?: string,
) {
    // get all project classes
    const projects = await listProjects();

    // check if the project exists with the configuration project name, region
    const project = projects.find(
        (project) => project.name === projectName && project.region === region,
    );

    if (!project) {
        throw new UserError(
            `The project ${projectName} on region ${region} doesn't exist. You must deploy it first with 'genezio deploy'.`,
        );
    }

    // get project info
    const projectEnv = await getProjectEnvFromProject(project.id, stage);

    // if the project doesn't exist, throw an error
    if (!projectEnv) {
        throw new UserError(
            `The project ${projectName} on stage ${stage} doesn't exist in the region ${region}. You must deploy it first with 'genezio deploy'.`,
        );
    }

    const sdkGeneratorInput: SdkGeneratorInput = {
        classesInfo: projectEnv.classes.map(
            (c): SdkGeneratorClassesInfoInput => ({
                program: mapDbAstToSdkGeneratorAst(c.ast),
                classConfiguration: {
                    path: c.ast.path,
                    type: TriggerType.jsonrpc,
                    methods: [],
                    language: path.extname(c.ast.path),
                    name: c.name,
                },
                fileName: path.basename(c.ast.path),
            }),
        ),
        language: language as Language,
        packageName: `@genezio-sdk/${projectName}`,
    };

    const sdkGeneratorOutput = await generateSdk(sdkGeneratorInput, undefined);

    const sdkGeneratorResponse: SdkGeneratorResponse = {
        files: sdkGeneratorOutput.files,
        sdkGeneratorInput: sdkGeneratorInput,
    };

    // replace the placeholder urls in the sdk with the actual cloud urls
    const classUrls: ClassUrlMap[] = [];

    // populate a map of class name and cloud url
    projectEnv.classes.forEach((classInfo) => {
        classUrls.push({
            name: classInfo.name,
            cloudUrl: classInfo.cloudUrl,
        });
    });

    await writeSdk({
        language,
        packageName: packageName || `@genezio-sdk/${projectName}`,
        packageVersion: packageVersion || `1.0.0-${stage}`,
        sdkResponse: sdkGeneratorResponse,
        classUrls,
        publish: false,
        installPackage: false,
        outputPath: sdkPath,
    });

    reportSuccessForSdk(language, sdkGeneratorResponse, GenezioCommand.sdk);
}
