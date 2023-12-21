import { AxiosError } from "axios";
import log from "loglevel";
import { exit } from "process";
import { languages } from "../utils/languages.js";
import { GENEZIO_NOT_AUTH_ERROR_MSG } from "../errors.js";
import {
    Language,
    TriggerType,
    YamlProjectConfiguration,
} from "../models/yamlProjectConfiguration.js";
import { getProjectEnvFromProject } from "../requests/getProjectInfo.js";
import listProjects from "../requests/listProjects.js";
import { getProjectConfiguration, scanClassesForDecorators } from "../utils/configuration.js";
import { ClassUrlMap, replaceUrlsInSdk, writeSdkToDisk } from "../utils/sdk.js";
import { GenezioTelemetry, TelemetryEventTypes } from "../telemetry/telemetry.js";
import path from "path";
import {
    SdkGeneratorClassesInfoInput,
    SdkGeneratorInput,
    SdkVersion,
} from "../models/genezioModels.js";
import { mapDbAstToSdkGeneratorAst } from "../generateSdk/utils/mapDbAstToFullAst.js";
import { generateSdk } from "../generateSdk/sdkGeneratorHandler.js";
import { SdkGeneratorResponse } from "../models/sdkGeneratorResponse.js";
import inquirer, { Answers } from "inquirer";
import { GenezioSdkOptions, SourceType } from "../models/commandOptions.js";
import { sdkGeneratorApiHandler } from "../generateSdk/generateSdkApi.js";

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

export async function generateLocalSdkCommand(options: GenezioSdkOptions) {
    const url = options.url;
    if (!url) {
        throw new Error("You must provide a url when generating a local SDK.");
    }

    let configuration: YamlProjectConfiguration = await YamlProjectConfiguration.create({
        name: "test",
        language: options.language,
        sdk: {
            language: options.language,
            path: options.path,
        },
    });
    configuration = await scanClassesForDecorators(configuration);

    const sdkResponse: SdkGeneratorResponse = await sdkGeneratorApiHandler(configuration).catch(
        (error) => {
            // TODO: this is not very generic error handling. The SDK should throw Genezio errors, not babel.
            if (error.code === "BABEL_PARSER_SYNTAX_ERROR") {
                log.error("Syntax error:");
                log.error(`Reason Code: ${error.reasonCode}`);
                log.error(`File: ${error.path}:${error.loc.line}:${error.loc.column}`);

                throw error;
            }

            throw error;
        },
    );

    await replaceUrlsInSdk(
        sdkResponse,
        sdkResponse.files.map((c) => ({
            name: c.className,
            cloudUrl: url,
        })),
    );

    await writeSdkToDisk(sdkResponse, configuration.sdk!.language, configuration.sdk!.path);
}

export async function generateRemoteSdkCommand(projectName: string, options: GenezioSdkOptions) {
    await GenezioTelemetry.sendEvent({
        eventType: TelemetryEventTypes.GENEZIO_GENERATE_SDK,
        commandOptions: JSON.stringify(options),
    });

    const language = options.language;
    const sdkPath = options.path;
    const stage = options.stage;
    const region = options.region;

    // check if language is supported using languages array
    if (!languages.includes(language)) {
        throw new Error(
            `The language you specified is not supported. Please use one of the following: ${languages}.`,
        );
    }

    if (projectName) {
        await generateRemoteSdkHandler(language, sdkPath, projectName, stage, region).catch(
            (error: AxiosError) => {
                if (error.response?.status == 401) {
                    throw new Error(GENEZIO_NOT_AUTH_ERROR_MSG);
                }
                throw error;
            },
        );
    } else {
        let config = options.config;
        // check if path ends in .genezio.yaml or else append it
        if (!config.endsWith("genezio.yaml")) {
            config = path.join(config, "genezio.yaml");
        }
        let configuration: YamlProjectConfiguration | undefined;
        try {
            configuration = await getProjectConfiguration(config);
        } catch (error) {
            if (
                error instanceof Error &&
                error.message === "The configuration file does not exist."
            ) {
                const answers: Answers = await inquirer.prompt([
                    {
                        type: "confirm",
                        name: "createConfig",
                        message:
                            "Oops! The configuration file does not exist at the specified path. Do you want us to create one for you?",
                    },
                ]);
                if (answers["createConfig"]) {
                    const projects = await listProjects(0);
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
                    const answers: Answers = await inquirer.prompt([
                        {
                            type: "list",
                            name: "project",
                            message: "Select the project you want to generate the SDK for:",
                            choices: options,
                        },
                    ]);
                    configuration = await YamlProjectConfiguration.create({
                        name: answers["project"].name,
                        region: answers["project"].region,
                    });
                    await configuration.writeToFile(config);
                } else {
                    exit(1);
                }
            } else {
                throw error;
            }
        }
        const name = configuration.name;
        const configurationRegion = configuration.region;

        await generateRemoteSdkHandler(language, sdkPath, name, stage, configurationRegion);
    }

    log.info("Your SDK has been generated successfully in " + sdkPath + "");
}

async function generateRemoteSdkHandler(
    language: string,
    sdkPath: string,
    projectName: string,
    stage: string,
    region: string,
) {
    // get all project classes
    const projects = await listProjects(0);

    // check if the project exists with the configuration project name, region
    const project = projects.find(
        (project) => project.name === projectName && project.region === region,
    );

    if (!project) {
        throw new Error(
            `The project ${projectName} on region ${region} doesn't exist. You must deploy it first with 'genezio deploy'.`,
        );
    }

    // get project info
    const projectEnv = await getProjectEnvFromProject(project.id, stage);

    // if the project doesn't exist, throw an error
    if (!projectEnv) {
        throw new Error(
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
                    getMethodType: () => TriggerType.jsonrpc,
                    fromDecorator: false,
                },
                fileName: path.basename(c.ast.path),
            }),
        ),
        sdk: {
            language: language as Language,
        },
    };

    const sdkGeneratorOutput = await generateSdk(sdkGeneratorInput, undefined, SdkVersion.OLD_SDK);

    const sdkGeneratorResponse: SdkGeneratorResponse = {
        files: sdkGeneratorOutput.files,
        sdkGeneratorInput: sdkGeneratorInput,
    };

    // replace the placeholder urls in the sdk with the actual cloud urls
    const classUrlMap: ClassUrlMap[] = [];

    // populate a map of class name and cloud url
    projectEnv.classes.forEach((classInfo) => {
        classUrlMap.push({
            name: classInfo.name,
            cloudUrl: classInfo.cloudUrl,
        });
    });

    await replaceUrlsInSdk(sdkGeneratorResponse, classUrlMap);

    // write the sdk to disk in the specified path
    await writeSdkToDisk(sdkGeneratorResponse, language as Language, sdkPath);
}
