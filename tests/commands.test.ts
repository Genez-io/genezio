import { Document } from "yaml";

import { fileExists, writeToFile } from "../src/utils/file";
import { askQuestion } from "../src/utils/prompt";
import { GENEZIO_YAML_COMMENT } from "../src/utils/strings";
import { getProjectConfiguration } from "../src/utils/configuration";
import {
  Language,
  TriggerType,
  YamlClassConfiguration,
  YamlProjectConfiguration,
  YamlSdkConfiguration
} from "../src/models/yamlProjectConfiguration";
import { regions } from "../src/utils/configs";
import { initCommand } from "../src/commands/init";
import { addClassCommand } from "../src/commands/addClass";
import { languages } from "../src/utils/languages";

jest.mock("../src/utils/file");
jest.mock("../src/utils/configuration");
jest.mock("../src/utils/prompt");

beforeEach(() => {
  jest.clearAllMocks();
});

describe("init", () => {
  test("create genezio.yaml succesfully", async () => {
    const mockedAskQuestion = jest.mocked(askQuestion, { shallow: true });
    mockedAskQuestion
    .mockResolvedValueOnce("project-name")
    .mockResolvedValueOnce("us-east-1")
    .mockResolvedValueOnce("js")
    .mockResolvedValueOnce("./sdk/")

    const mockedWriteToFile = jest.mocked(writeToFile, { shallow: true });
    mockedWriteToFile.mockResolvedValue();

    const configFile : any = {
      name: "project-name",
      region: "us-east-1",
      sdk: { language: "js", path: "./sdk/" },
      classes: []
    };

    const doc = new Document(configFile);
    doc.commentBefore = GENEZIO_YAML_COMMENT

    const yamlConfigurationFileContent = doc.toString();

    await expect(initCommand()).resolves.toBeUndefined();

    expect(mockedWriteToFile).toBeCalledTimes(1);
    expect(mockedAskQuestion).toBeCalledTimes(4);
    expect(mockedWriteToFile).toBeCalledWith(".", "genezio.yaml", yamlConfigurationFileContent)
    expect(mockedAskQuestion).toHaveBeenNthCalledWith(1, `What is the name of the project: `)
    expect(mockedAskQuestion).toHaveBeenNthCalledWith(2, `What region do you want to deploy your project to? [default value: us-east-1]: `, "us-east-1")
    expect(mockedAskQuestion).toHaveBeenNthCalledWith(3, `In what programming language do you want your SDK? (${languages}) [default value: js]: `, "js")
    expect(mockedAskQuestion).toHaveBeenNthCalledWith(4, `Where do you want to save your SDK? [default value: ./sdk/]: `, "./sdk/")
  });

  test("throws error if region is not supported", async () => {
    const notSupportedRegion = "not-supported";
    const mockedAskQuestion = jest.mocked(askQuestion, { shallow: true });
    mockedAskQuestion
    .mockResolvedValueOnce("project-name")
    .mockResolvedValueOnce(notSupportedRegion)

    await expect(initCommand()).rejects.toThrowError(`The region is invalid. Please use a valid region.\n Region list: ${regions}`);

    expect(mockedAskQuestion).toBeCalledTimes(2);
    expect(mockedAskQuestion).toHaveBeenNthCalledWith(1, `What is the name of the project: `)
    expect(mockedAskQuestion).toHaveBeenNthCalledWith(2, `What region do you want to deploy your project to? [default value: us-east-1]: `, "us-east-1")
  });

  test("throws error if language is not supported", async () => {
    const notSupportedLanguage = "not-supported";
    const mockedAskQuestion = jest.mocked(askQuestion, { shallow: true });
    mockedAskQuestion
    .mockResolvedValueOnce("project-name")
    .mockResolvedValueOnce("us-east-1")
    .mockResolvedValueOnce(notSupportedLanguage)

    await expect(initCommand()).rejects.toThrowError(`We don't currently support the ${notSupportedLanguage} language. You can open an issue ticket at https://github.com/Genez-io/genezio/issues.`);

    expect(mockedAskQuestion).toBeCalledTimes(3);
    expect(mockedAskQuestion).toHaveBeenNthCalledWith(1, `What is the name of the project: `)
    expect(mockedAskQuestion).toHaveBeenNthCalledWith(2, `What region do you want to deploy your project to? [default value: us-east-1]: `, "us-east-1")
    expect(mockedAskQuestion).toHaveBeenNthCalledWith(3, `In what programming language do you want your SDK? (${languages}) [default value: js]: `, "js")
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
    await expect(addClassCommand("./test", "jsonrpc")).rejects.toThrowError("Please provide a class name with a valid class extension.");
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
      new YamlSdkConfiguration(Language.js, "./test.js"),
      "genezio",
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
      new YamlSdkConfiguration(Language.js, "./test.js"),
      "genezio",
      []
    );
    projectConfiguration.addClass = jest.fn();
    projectConfiguration.writeToFile = jest.fn();
    mockedGetProjectConfiguration.mockResolvedValue(projectConfiguration);

    await expect(addClassCommand("./test.js", "jsonrpc")).resolves.toBeUndefined();

    expect(mockedFileExists).toBeCalledTimes(1);
    expect(mockedWriteToFile).toBeCalledTimes(1);
    expect(projectConfiguration.addClass).toBeCalledTimes(1);
    expect(projectConfiguration.writeToFile).toBeCalledTimes(1);
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
      new YamlSdkConfiguration(Language.js, "./test.js"),
      "genezio",
      []
    );
    projectConfiguration.addClass = jest.fn();
    projectConfiguration.writeToFile = jest.fn();
    mockedGetProjectConfiguration.mockResolvedValue(projectConfiguration);

    await expect(addClassCommand("./test.js", "jsonrpc")).resolves.toBeUndefined();

    expect(mockedFileExists).toBeCalledTimes(1);
    expect(mockedWriteToFile).toBeCalledTimes(0);
    expect(projectConfiguration.addClass).toBeCalledTimes(1);
    expect(projectConfiguration.writeToFile).toBeCalledTimes(1);
  });
});
