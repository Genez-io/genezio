import { fileExists, writeToFile } from "../src/utils/file";
import { askQuestion } from "../src/utils/prompt";
import { getProjectConfiguration } from "../src/utils/configuration";
import {
    Language,
    TriggerType,
    YamlClassConfiguration,
    YamlProjectConfiguration,
    YamlSdkConfiguration,
} from "../src/models/yamlProjectConfiguration";
import { initCommand } from "../src/commands/init";
import { CloudProviderIdentifier } from "../src/models/cloudProviderIdentifier";
import log from "loglevel";
import { red } from "../src/utils/strings";
import { regions } from "../src/utils/configs";

jest.mock("../src/utils/file");
jest.mock("../src/utils/configuration");
jest.mock("../src/utils/prompt");
jest.mock("loglevel", () => {
    return {
        ...jest.requireActual("loglevel"),
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    };
});

beforeEach(() => {
    jest.clearAllMocks();
});

describe("init", () => {
    test("create genezio.yaml successfully", async () => {
        const mockedAskQuestion = jest.mocked(askQuestion, { shallow: true });

        mockedAskQuestion
            .mockResolvedValueOnce("project-name")
            .mockResolvedValueOnce("us-east-1")
            .mockResolvedValueOnce("ts");

        const mockedWriteToFile = jest.mocked(writeToFile, { shallow: true });
        mockedWriteToFile.mockResolvedValue();

        const configFile = {
            name: "project-name",
            region: "us-east-1",
            language: "ts",
            classes: [],
        };

        const yamlConfigurationFileContent = `# Visit https://docs.genez.io/genezio-documentation/yaml-configuration-file to read more about this file

name: ${configFile.name}

# Configure where you want your project to be deployed. Choose the closest location to your users.
region: ${configFile.region}

# Configure the language of your project. The supported languages are: "js", "ts", "dart".
language: ${configFile.language}

#sdk:
#  language: ts                                                                              # The supported languages are: "js", "ts", "dart", "python".
#  path: ../client/src/sdk/                                                                  # The path to the SDK folder. The SDK will be generated in this folder.

#frontend:
#  path: ../client/build/                                                                    # The path to the frontend build folder.
#  subdomain: your-awesome-domain                                                            # Uncomment if you want to specify a subdomain

# Define scripts that run at different stages of deployment.
#scripts:
#  preBackendDeploy: "echo 'preBackendDeploy'"                                               # The script that will run before the backend is deployed.
#  postBackendDeploy: "echo 'postBackendDeploy'"                                             # The script that will run after the backend is deployed.
#  preFrontendDeploy: "echo 'preFrontendDeploy'"                                             # The script that will run before the frontend is deployed.
#  postFrontendDeploy: "echo 'postFrontendDeploy'"                                           # The script that will run after the frontend is deployed.

# Specify the classes that will be handled by the genezio CLI.
#classes:
#  - path: "./index.js"                                                                      # The path to the class file.
#    type: jsonrpc
#    methods:
#      - name: "sayHiEveryMinute"
#        type: cron
#        cronString: "* * * * *"                                                             # The cron string that defines the schedule of the method.
#      - name: "helloWorldOverHttp"
#        type: http
#      - name: "helloWorldOverJsonrpc"
#        type: jsonrpc
#      - name: "helloWorldOverJsonrpcByDefault"
classes: []

# Specify the Node runtime version to be used by your application.
#options:
#  nodeRuntime: nodejs18.x                                                                   # The supported values are nodejs16.x, nodejs18.x.`;

        await expect(initCommand("./project-name")).resolves.toBeUndefined();

        expect(mockedWriteToFile).toBeCalledTimes(2);
        expect(mockedAskQuestion).toBeCalledTimes(3);
        expect(mockedWriteToFile).toBeCalledWith(
            "./project-name",
            "genezio.yaml",
            yamlConfigurationFileContent,
            true,
        );
        expect(mockedAskQuestion).toHaveBeenNthCalledWith(1, `What is the name of the project: `);
        expect(mockedAskQuestion).toHaveBeenNthCalledWith(
            2,
            `What region do you want to deploy your project to? [default value: us-east-1]: `,
            "us-east-1",
        );
    });

    test("handle error for empty project", async () => {
        const mockedAskQuestion = jest.mocked(askQuestion, { shallow: true });
        const mockedLogError = jest.spyOn(log, "error");

        mockedAskQuestion
            .mockResolvedValueOnce("")
            .mockResolvedValueOnce("project-name")
            .mockResolvedValueOnce("us-east-1")
            .mockResolvedValueOnce("ts");

        const mockedWriteToFile = jest.mocked(writeToFile, { shallow: true });
        mockedWriteToFile.mockResolvedValue();

        const configFile = {
            name: "project-name",
            region: "us-east-1",
            language: "ts",
            classes: [],
        };

        const yamlConfigurationFileContent = `# Visit https://docs.genez.io/genezio-documentation/yaml-configuration-file to read more about this file

name: ${configFile.name}

# Configure where you want your project to be deployed. Choose the closest location to your users.
region: ${configFile.region}

# Configure the language of your project. The supported languages are: "js", "ts", "dart".
language: ${configFile.language}

#sdk:
#  language: ts                                                                              # The supported languages are: "js", "ts", "dart", "python".
#  path: ../client/src/sdk/                                                                  # The path to the SDK folder. The SDK will be generated in this folder.

#frontend:
#  path: ../client/build/                                                                    # The path to the frontend build folder.
#  subdomain: your-awesome-domain                                                            # Uncomment if you want to specify a subdomain

# Define scripts that run at different stages of deployment.
#scripts:
#  preBackendDeploy: "echo 'preBackendDeploy'"                                               # The script that will run before the backend is deployed.
#  postBackendDeploy: "echo 'postBackendDeploy'"                                             # The script that will run after the backend is deployed.
#  preFrontendDeploy: "echo 'preFrontendDeploy'"                                             # The script that will run before the frontend is deployed.
#  postFrontendDeploy: "echo 'postFrontendDeploy'"                                           # The script that will run after the frontend is deployed.

# Specify the classes that will be handled by the genezio CLI.
#classes:
#  - path: "./index.js"                                                                      # The path to the class file.
#    type: jsonrpc
#    methods:
#      - name: "sayHiEveryMinute"
#        type: cron
#        cronString: "* * * * *"                                                             # The cron string that defines the schedule of the method.
#      - name: "helloWorldOverHttp"
#        type: http
#      - name: "helloWorldOverJsonrpc"
#        type: jsonrpc
#      - name: "helloWorldOverJsonrpcByDefault"
classes: []

# Specify the Node runtime version to be used by your application.
#options:
#  nodeRuntime: nodejs18.x                                                                   # The supported values are nodejs16.x, nodejs18.x.`;

        await expect(initCommand("./project-name")).resolves.toBeUndefined();

        expect(mockedLogError).toBeCalledTimes(1);
        expect(mockedLogError).toBeCalledWith(
            red,
            `The project name can't be empty. Please provide one.`,
        );
        expect(mockedWriteToFile).toBeCalledTimes(2);
        expect(mockedAskQuestion).toBeCalledTimes(4);
        expect(mockedWriteToFile).toBeCalledWith(
            "./project-name",
            "genezio.yaml",
            yamlConfigurationFileContent,
            true,
        );
        expect(mockedAskQuestion).toHaveBeenNthCalledWith(1, `What is the name of the project: `);
        expect(mockedAskQuestion).toHaveBeenNthCalledWith(2, `What is the name of the project: `);
        expect(mockedAskQuestion).toHaveBeenNthCalledWith(
            3,
            `What region do you want to deploy your project to? [default value: us-east-1]: `,
            "us-east-1",
        );
    });

    test("handle error for invalid region", async () => {
        const mockedAskQuestion = jest.mocked(askQuestion, { shallow: true });
        const mockedLogError = jest.spyOn(log, "error");
        const notSupported = "not-supported";

        mockedAskQuestion
            .mockResolvedValueOnce("project-name")
            .mockResolvedValueOnce(notSupported)
            .mockResolvedValueOnce("us-east-1")
            .mockResolvedValueOnce("ts");

        const mockedWriteToFile = jest.mocked(writeToFile, { shallow: true });
        mockedWriteToFile.mockResolvedValue();

        const configFile = {
            name: "project-name",
            region: "us-east-1",
            language: "ts",
            classes: [],
        };

        const yamlConfigurationFileContent = `# Visit https://docs.genez.io/genezio-documentation/yaml-configuration-file to read more about this file

name: ${configFile.name}

# Configure where you want your project to be deployed. Choose the closest location to your users.
region: ${configFile.region}

# Configure the language of your project. The supported languages are: "js", "ts", "dart".
language: ${configFile.language}

#sdk:
#  language: ts                                                                              # The supported languages are: "js", "ts", "dart", "python".
#  path: ../client/src/sdk/                                                                  # The path to the SDK folder. The SDK will be generated in this folder.

#frontend:
#  path: ../client/build/                                                                    # The path to the frontend build folder.
#  subdomain: your-awesome-domain                                                            # Uncomment if you want to specify a subdomain

# Define scripts that run at different stages of deployment.
#scripts:
#  preBackendDeploy: "echo 'preBackendDeploy'"                                               # The script that will run before the backend is deployed.
#  postBackendDeploy: "echo 'postBackendDeploy'"                                             # The script that will run after the backend is deployed.
#  preFrontendDeploy: "echo 'preFrontendDeploy'"                                             # The script that will run before the frontend is deployed.
#  postFrontendDeploy: "echo 'postFrontendDeploy'"                                           # The script that will run after the frontend is deployed.

# Specify the classes that will be handled by the genezio CLI.
#classes:
#  - path: "./index.js"                                                                      # The path to the class file.
#    type: jsonrpc
#    methods:
#      - name: "sayHiEveryMinute"
#        type: cron
#        cronString: "* * * * *"                                                             # The cron string that defines the schedule of the method.
#      - name: "helloWorldOverHttp"
#        type: http
#      - name: "helloWorldOverJsonrpc"
#        type: jsonrpc
#      - name: "helloWorldOverJsonrpcByDefault"
classes: []

# Specify the Node runtime version to be used by your application.
#options:
#  nodeRuntime: nodejs18.x                                                                   # The supported values are nodejs16.x, nodejs18.x.`;

        await expect(initCommand("./project-name")).resolves.toBeUndefined();

        expect(mockedLogError).toBeCalledTimes(1);
        expect(mockedLogError).toBeCalledWith(
            red,
            `The region is invalid. Please use a valid region.\n Region list: ${regions}`,
        );
        expect(mockedWriteToFile).toBeCalledTimes(2);
        expect(mockedAskQuestion).toBeCalledTimes(4);
        expect(mockedWriteToFile).toBeCalledWith(
            "./project-name",
            "genezio.yaml",
            yamlConfigurationFileContent,
            true,
        );
        expect(mockedAskQuestion).toHaveBeenNthCalledWith(1, `What is the name of the project: `);
        expect(mockedAskQuestion).toHaveBeenNthCalledWith(
            2,
            `What region do you want to deploy your project to? [default value: us-east-1]: `,
            "us-east-1",
        );
        expect(mockedAskQuestion).toHaveBeenNthCalledWith(
            3,
            `What region do you want to deploy your project to? [default value: us-east-1]: `,
            "us-east-1",
        );
    });
});
