import { addNewClass } from "../src/commands";
import { fileExists, writeToFile } from "../src/utils/file";
import { getProjectConfiguration } from "../src/utils/configuration";
import {
  JsRuntime,
  Language,
  YamlProjectConfiguration,
  YamlSdkConfiguration
} from "../src/models/projectConfiguration";

jest.mock("../src/utils/file");
jest.mock("../src/utils/configuration");

beforeEach(() => {
  jest.clearAllMocks();
});

describe("addNewClass", () => {
  test("throws error if class type is not supported", async () => {
    await expect(addNewClass("./test.js", "grpc")).rejects.toThrowError();
    await expect(addNewClass("./test.js", "cron")).rejects.toThrowError();
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
      new YamlSdkConfiguration(Language.js, JsRuntime.browser, "./test.js"),
      []
    );
    projectConfiguration.addClass = jest.fn();
    projectConfiguration.writeToFile = jest.fn();
    mockedGetProjectConfiguration.mockResolvedValue(projectConfiguration);

    await expect(addNewClass("./test.js", "jsonrpc")).resolves.toBeUndefined();

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
      new YamlSdkConfiguration(Language.js, JsRuntime.browser, "./test.js"),
      []
    );
    projectConfiguration.addClass = jest.fn();
    projectConfiguration.writeToFile = jest.fn();
    mockedGetProjectConfiguration.mockResolvedValue(projectConfiguration);

    await expect(addNewClass("./test.js", "jsonrpc")).resolves.toBeUndefined();

    expect(mockedFileExists).toBeCalledTimes(1);
    expect(mockedWriteToFile).toBeCalledTimes(0);
    expect(projectConfiguration.addClass).toBeCalledTimes(1);
    expect(projectConfiguration.writeToFile).toBeCalledTimes(1);
  });
});
