import { Document } from "yaml";

import { fileExists, writeToFile } from "../src/utils/file";
import { askQuestion } from "../src/utils/prompt";
import { getProjectConfiguration } from "../src/utils/configuration";
import {
  Language,
  TriggerType,
  YamlClassConfiguration,
  YamlProjectConfiguration,
  YamlSdkConfiguration
} from "../src/models/yamlProjectConfiguration";
import { initCommand } from "../src/commands/init";
import { addClassCommand } from "../src/commands/addClass";
import { languages } from "../src/utils/languages";
import { CloudProviderIdentifier } from "../src/models/cloudProviderIdentifier";
import log from "loglevel";
import { red } from "../src/utils/strings";
import { regions } from "../src/utils/configs";

jest.mock("../src/utils/file");
jest.mock("../src/utils/configuration");
jest.mock("../src/utils/prompt");
jest.mock("loglevel");

beforeEach(() => {
  jest.clearAllMocks();
});

describe("init", () => {
  test("create genezio.yaml successfully", async () => {
    const mockedAskQuestion = jest.mocked(askQuestion, { shallow: true });

    mockedAskQuestion
    .mockResolvedValueOnce("project-name")
    .mockResolvedValueOnce("us-east-1")
    .mockResolvedValueOnce("ts")

    const mockedWriteToFile = jest.mocked(writeToFile, { shallow: true });
    mockedWriteToFile.mockResolvedValue();

    const configFile : any = {
      name: "project-name",
      region: "us-east-1",
      language: "ts",
      classes: []
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

    expect(mockedWriteToFile).toBeCalledTimes(1);
    expect(mockedAskQuestion).toBeCalledTimes(3);
    expect(mockedWriteToFile).toBeCalledWith("./project-name", "genezio.yaml", yamlConfigurationFileContent, true)
    expect(mockedAskQuestion).toHaveBeenNthCalledWith(1, `What is the name of the project: `)
    expect(mockedAskQuestion).toHaveBeenNthCalledWith(2, `What region do you want to deploy your project to? [default value: us-east-1]: `, "us-east-1")
  });

  test("handle error for empty project", async () => {
    const mockedAskQuestion = jest.mocked(askQuestion, { shallow: true });
    const mockedLogError = jest.spyOn(log, "error");

    mockedAskQuestion
    .mockResolvedValueOnce("")
    .mockResolvedValueOnce("project-name")
    .mockResolvedValueOnce("us-east-1")
    .mockResolvedValueOnce("ts")

    const mockedWriteToFile = jest.mocked(writeToFile, { shallow: true });
    mockedWriteToFile.mockResolvedValue();


    const configFile : any = {
      name: "project-name",
      region: "us-east-1",
      language: "ts",
      classes: []
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
    expect(mockedLogError).toBeCalledWith(red, `The project name can't be empty. Please provide one.`);
    expect(mockedWriteToFile).toBeCalledTimes(1);
    expect(mockedAskQuestion).toBeCalledTimes(4);
    expect(mockedWriteToFile).toBeCalledWith("./project-name", "genezio.yaml", yamlConfigurationFileContent, true)
    expect(mockedAskQuestion).toHaveBeenNthCalledWith(1, `What is the name of the project: `)
    expect(mockedAskQuestion).toHaveBeenNthCalledWith(2, `What is the name of the project: `)
    expect(mockedAskQuestion).toHaveBeenNthCalledWith(3, `What region do you want to deploy your project to? [default value: us-east-1]: `, "us-east-1")
  });

  test("handle error for invalid region", async () => {
    const mockedAskQuestion = jest.mocked(askQuestion, { shallow: true });
    const mockedLogError = jest.spyOn(log, "error");
    const notSupported = "not-supported";

    mockedAskQuestion
    .mockResolvedValueOnce("project-name")
    .mockResolvedValueOnce(notSupported)
    .mockResolvedValueOnce("us-east-1")
    .mockResolvedValueOnce("ts")

    const mockedWriteToFile = jest.mocked(writeToFile, { shallow: true });
    mockedWriteToFile.mockResolvedValue();

    const configFile : any = {
      name: "project-name",
      region: "us-east-1",
      language: "ts",
      classes: []
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
    expect(mockedLogError).toBeCalledWith(red, `The region is invalid. Please use a valid region.\n Region list: ${regions}`);
    expect(mockedWriteToFile).toBeCalledTimes(1);
    expect(mockedAskQuestion).toBeCalledTimes(4);
    expect(mockedWriteToFile).toBeCalledWith("./project-name", "genezio.yaml", yamlConfigurationFileContent, true)
    expect(mockedAskQuestion).toHaveBeenNthCalledWith(1, `What is the name of the project: `)
    expect(mockedAskQuestion).toHaveBeenNthCalledWith(2, `What region do you want to deploy your project to? [default value: us-east-1]: `, "us-east-1")
    expect(mockedAskQuestion).toHaveBeenNthCalledWith(3, `What region do you want to deploy your project to? [default value: us-east-1]: `, "us-east-1")
  });
})

describe("addClassCommand", () => {
  test("throws error if class type is not supported", async () => {
    await expect(addClassCommand("./test.js", "grpc")).rejects.toThrowError("Invalid class type. Valid class types are 'http' and 'jsonrpc'.");
    await expect(addClassCommand("./test.js", "cron")).rejects.toThrowError("Invalid class type. Valid class types are 'http' and 'jsonrpc'.");
  });

  test("throws error if path is not provided", async () => {
    await expect(addClassCommand("", "jsonrpc")).rejects.toThrowError("Please provide a path to the class you want to add.");
  });

  test("throws if extension is not supported", async () => {
    await expect(addClassCommand("test.py", "jsonrpc")).rejects.toThrowError("Class language(py) not supported. Currently supporting: ts, js, dart and kt");
  });

  test("throws if extension is not supported", async () => {
    await expect(addClassCommand("test", "jsonrpc")).rejects.toThrowError("Please provide a class name with a valid class extension.");
  });

  test("throws if class already exists", async () => {
    const mockedFileExists = jest.mocked(fileExists, { shallow: true });
    mockedFileExists.mockResolvedValue(true);

    const mockedWriteToFile = jest.mocked(writeToFile, { shallow: true });
    mockedWriteToFile.mockResolvedValue();

    const mockedGetProjectConfiguration = jest.mocked(getProjectConfiguration, {
      shallow: true
    });
    const projectConfiguration = new YamlProjectConfiguration(
      "test",
      "us-east-1",
      Language.js,
      new YamlSdkConfiguration(Language.js, "./test.js"),
      CloudProviderIdentifier.GENEZIO,
      [new YamlClassConfiguration("./test.js", TriggerType.jsonrpc, Language.js, [])] as YamlClassConfiguration[],
    );
    projectConfiguration.addClass = jest.fn();
    projectConfiguration.writeToFile = jest.fn();
    mockedGetProjectConfiguration.mockResolvedValue(projectConfiguration);

    await expect(addClassCommand("./test.js", "jsonrpc")).rejects.toThrowError("Class already exists.");

    expect(mockedFileExists).toBeCalledTimes(0);
    expect(mockedWriteToFile).toBeCalledTimes(0);
    expect(projectConfiguration.addClass).toBeCalledTimes(0);
    expect(projectConfiguration.writeToFile).toBeCalledTimes(0);
  });

  test("create class with non existing file", async () => {
    const mockedFileExists = jest.mocked(fileExists, { shallow: true });
    mockedFileExists.mockResolvedValue(false);

    const mockedWriteToFile = jest.mocked(writeToFile, { shallow: true });
    mockedWriteToFile.mockResolvedValue();

    const mockedGetProjectConfiguration = jest.mocked(getProjectConfiguration, {
      shallow: true
    });
    const projectConfiguration = new YamlProjectConfiguration(
      "test",
      "us-east-1",
      Language.js,
      new YamlSdkConfiguration(Language.js, "./test.js"),
      CloudProviderIdentifier.GENEZIO,
      []
    );
    projectConfiguration.addClass = jest.fn();
    projectConfiguration.writeToFile = jest.fn();
    mockedGetProjectConfiguration.mockResolvedValue(projectConfiguration);

    await expect(addClassCommand("./test.js", "jsonrpc")).resolves.toBeUndefined();

    expect(mockedFileExists).toBeCalledTimes(1);
    expect(mockedWriteToFile).toBeCalledTimes(1);
  });

  test("create class with existing file", async () => {
    const mockedFileExists = jest.mocked(fileExists, { shallow: true });
    mockedFileExists.mockResolvedValue(true);

    const mockedWriteToFile = jest.mocked(writeToFile, { shallow: true });
    mockedWriteToFile.mockResolvedValue();

    const mockedGetProjectConfiguration = jest.mocked(getProjectConfiguration, {
      shallow: true
    });
    const projectConfiguration = new YamlProjectConfiguration(
      "test",
      "us-east-1",
      Language.js,
      new YamlSdkConfiguration(Language.js, "./test.js"),
      CloudProviderIdentifier.GENEZIO,
      []
    );
    projectConfiguration.addClass = jest.fn();
    projectConfiguration.writeToFile = jest.fn();
    mockedGetProjectConfiguration.mockResolvedValue(projectConfiguration);

    await expect(addClassCommand("./test.js", "jsonrpc")).resolves.toBeUndefined();

    expect(mockedFileExists).toBeCalledTimes(1);
    expect(mockedWriteToFile).toBeCalledTimes(0);
  });
});
