import { YamlProjectConfiguration } from "../../../projectConfiguration/yaml/v2.js";
import { GenezioDeployOptions } from "../../../models/commandOptions.js";
import {
    DEFAULT_ARCHITECTURE,
    DEFAULT_PYTHON_RUNTIME,
    PythonRuntime,
    SSRFrameworkComponentType,
} from "../../../models/projectOptions.js";
import {
    PackageManagerType,
    PYTHON_DEFAULT_PACKAGE_MANAGER,
} from "../../../packageManagers/packageManager.js";
import { PYTHON_DEFAULT_ENTRY_FILE } from "../../analyze/command.js";
import { STREAMLIT_PATTERN } from "../../analyze/constants.js";
import { findEntryFile } from "../../analyze/frameworks.js";
import { addSSRComponentToConfig } from "../../analyze/utils.js";
import {
    prepareServicesPostBackendDeployment,
    prepareServicesPreBackendDeployment,
    readOrAskConfig,
    uploadEnvVarsFromFile,
    uploadUserCode,
} from "../utils.js";
import path from "path";
import fs from "fs";
import { debugLogger, log } from "../../../utils/logging.js";
import colors from "colors";
import { Language } from "../../../projectConfiguration/yaml/models.js";
import { DASHBOARD_URL } from "../../../constants.js";
import { getCloudProvider } from "../../../requests/getCloudProvider.js";
import { functionToCloudInput, getCloudAdapter } from "../genezio.js";
import { FunctionType } from "../../../projectConfiguration/yaml/models.js";
import { ProjectConfiguration } from "../../../models/projectConfiguration.js";
import { createTemporaryFolder } from "../../../utils/file.js";

export async function streamlitDeploy(options: GenezioDeployOptions) {
    const genezioConfig = await readOrAskConfig(options.config);
    const packageManagerType =
        genezioConfig.streamlit?.packageManager || PYTHON_DEFAULT_PACKAGE_MANAGER;

    const cwd = process.cwd();
    const componentPath = genezioConfig.streamlit?.path
        ? path.resolve(cwd, genezioConfig.streamlit.path)
        : cwd;

    // Prepare services before deploying (database, authentication, etc)
    await prepareServicesPreBackendDeployment(
        genezioConfig,
        genezioConfig.name,
        options.stage,
        options.env,
    );

    const entryFile = await findEntryFile(
        componentPath,
        getFilesContents(componentPath),
        STREAMLIT_PATTERN,
        PYTHON_DEFAULT_ENTRY_FILE,
    );

    // Add streamlit component to config
    await addSSRComponentToConfig(
        options.config,
        {
            path: componentPath,
            packageManager: packageManagerType,
            runtime: DEFAULT_PYTHON_RUNTIME,
            entryFile: entryFile,
        },
        SSRFrameworkComponentType.streamlit,
    );

    // Copy to tmp folder
    const tempCwd = await createTemporaryFolder();
    debugLogger.debug(`Copying project files to ${tempCwd}`);
    await fs.promises.cp(componentPath, tempCwd, {
        recursive: true,
        force: true,
        dereference: true,
    });

    const randomId = Math.random().toString(36).substring(2, 6);
    const startFileName = `start-${randomId}.py`;
    const startFile = path.join(tempCwd, startFileName);
    if (!fs.existsSync(startFile)) {
        fs.writeFileSync(startFile, getStartFileContent(entryFile));
    }

    const updatedGenezioConfig = await readOrAskConfig(options.config);
    // Deploy the component
    const result = await deployFunction(updatedGenezioConfig, options, tempCwd, startFileName);

    await uploadEnvVarsFromFile(
        options.env,
        result.projectId,
        result.projectEnvId,
        tempCwd,
        options.stage || "prod",
        updatedGenezioConfig,
        SSRFrameworkComponentType.streamlit,
    );

    await uploadUserCode(
        updatedGenezioConfig.name,
        updatedGenezioConfig.region,
        options.stage,
        componentPath,
    );

    const functionUrl = result.functions.find((f) => f.name === "function-streamlit")?.cloudUrl;

    await prepareServicesPostBackendDeployment(
        updatedGenezioConfig,
        updatedGenezioConfig.name,
        options.stage,
    );

    if (functionUrl) {
        log.info(
            `The app is being deployed at ${colors.cyan(functionUrl)}. It might take a few moments to be available worldwide.`,
        );

        log.info(
            `\nApp Dashboard URL: ${colors.cyan(`${DASHBOARD_URL}/project/${result.projectId}/${result.projectEnvId}`)}\n` +
                `${colors.dim("Here you can monitor logs, set up a custom domain, and more.")}\n`,
        );
    } else {
        log.warn("No deployment URL was returned.");
    }
}

async function deployFunction(
    config: YamlProjectConfiguration,
    options: GenezioDeployOptions,
    cwd: string,
    startFileName: string,
) {
    const cloudProvider = await getCloudProvider(config.name);
    const cloudAdapter = getCloudAdapter(cloudProvider);

    const serverFunction = {
        path: ".",
        name: "streamlit",
        entry: startFileName,
        type: FunctionType.httpServer,
        timeout: config.streamlit?.timeout,
        storageSize: config.streamlit?.storageSize,
        instanceSize: config.streamlit?.instanceSize,
        vcpuCount: config.streamlit?.vcpuCount,
        memoryMb: config.streamlit?.memoryMb,
        maxConcurrentRequestsPerInstance: config.streamlit?.maxConcurrentRequestsPerInstance,
        maxConcurrentInstances: config.streamlit?.maxConcurrentInstances,
        cooldownTime: config.streamlit?.cooldownTime,
    };

    const runtime = (config.streamlit?.runtime as PythonRuntime) || DEFAULT_PYTHON_RUNTIME;

    const deployConfig: YamlProjectConfiguration = {
        ...config,
        backend: {
            path: ".",
            language: {
                name: Language.python,
                runtime: runtime,
                architecture: DEFAULT_ARCHITECTURE,
                packageManager: PackageManagerType.pip,
            },
            functions: [serverFunction],
        },
    };

    const projectConfiguration = new ProjectConfiguration(
        deployConfig,
        await getCloudProvider(deployConfig.name),
        {
            generatorResponses: [],
            classesInfo: [],
        },
    );

    const cloudInputs = await Promise.all(
        projectConfiguration.functions.map((f) => functionToCloudInput(f, cwd, undefined, runtime)),
    );

    const result = await cloudAdapter.deploy(
        cloudInputs,
        projectConfiguration,
        { stage: options.stage },
        ["streamlit"],
    );

    return result;
}

function getStartFileContent(entryFile: string) {
    const startFileContent = `
import streamlit.web.bootstrap as bootstrap
import asyncio

flags = {
    'server_port': 8080,
    'global_developmentMode': False
}

loop = asyncio.new_event_loop()
asyncio.set_event_loop(loop)

bootstrap.load_config_options(flag_options=flags)
bootstrap.run('${entryFile}', False, [], flags)
`;

    return startFileContent;
}

function getFilesContents(dir: string): Record<string, string> {
    const contents: Record<string, string> = {};
    const files = fs.readdirSync(dir);

    for (const file of files) {
        if (file.endsWith(".py")) {
            const filePath = path.join(dir, file);
            contents[file] = fs.readFileSync(filePath, "utf8");
        }
    }
    return contents;
}
