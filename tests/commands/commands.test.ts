import { vi, describe, beforeEach, test, expect } from "vitest";
import { fileExists, writeToFile } from "../../src/utils/file";
import { getProjectConfiguration } from "../../src/utils/configuration";
import {
    Language,
    TriggerType,
    YamlClassConfiguration,
    YamlProjectConfiguration,
    YamlSdkConfiguration,
} from "../../src/models/yamlProjectConfiguration";
import { addClassCommand } from "../../src/commands/addClass";
import { CloudProviderIdentifier } from "../../src/models/cloudProviderIdentifier";

vi.mock("../../src/utils/file");
vi.mock("../../src/utils/configuration");
vi.mock("../../src/utils/prompt");

beforeEach(() => {
    vi.clearAllMocks();
});

describe("addClassCommand", () => {
    test("throws error if class type is not supported", async () => {
        await expect(addClassCommand("./test.js", "grpc")).rejects.toThrowError(
            "Invalid class type. Valid class types are 'http' and 'jsonrpc'.",
        );
        await expect(addClassCommand("./test.js", "cron")).rejects.toThrowError(
            "Invalid class type. Valid class types are 'http' and 'jsonrpc'.",
        );
    });

    test("throws error if path is not provided", async () => {
        await expect(addClassCommand("", "jsonrpc")).rejects.toThrowError(
            "Please provide a path to the class you want to add.",
        );
    });

    test("throws if extension is not supported", async () => {
        await expect(addClassCommand("test.py", "jsonrpc")).rejects.toThrowError(
            "Class language(py) not supported. Currently supporting: ts, js, dart and kt",
        );
    });

    test("throws if extension is not supported", async () => {
        await expect(addClassCommand("test", "jsonrpc")).rejects.toThrowError(
            "Please provide a class name with a valid class extension.",
        );
    });

    test("throws if class already exists", async () => {
        const mockedFileExists = vi.mocked(fileExists);
        mockedFileExists.mockResolvedValue(true);

        const mockedWriteToFile = vi.mocked(writeToFile);
        mockedWriteToFile.mockResolvedValue();

        const mockedGetProjectConfiguration = vi.mocked(getProjectConfiguration);
        const projectConfiguration = new YamlProjectConfiguration(
            "test",
            "us-east-1",
            Language.js,
            new YamlSdkConfiguration(Language.js, "./test.js"),
            CloudProviderIdentifier.GENEZIO,
            [
                new YamlClassConfiguration("./test.js", TriggerType.jsonrpc, Language.js, []),
            ] as YamlClassConfiguration[],
        );
        projectConfiguration.addClass = vi.fn();
        projectConfiguration.writeToFile = vi.fn();
        mockedGetProjectConfiguration.mockResolvedValue(projectConfiguration);

        await expect(addClassCommand("./test.js", "jsonrpc")).rejects.toThrowError(
            "Class already exists.",
        );

        expect(mockedFileExists).toBeCalledTimes(0);
        expect(mockedWriteToFile).toBeCalledTimes(1);
        expect(projectConfiguration.addClass).toBeCalledTimes(0);
        expect(projectConfiguration.writeToFile).toBeCalledTimes(0);
    });

    test("create class with non existing file", async () => {
        const mockedFileExists = vi.mocked(fileExists);
        mockedFileExists.mockResolvedValue(false);

        const mockedWriteToFile = vi.mocked(writeToFile);
        mockedWriteToFile.mockResolvedValue();

        const mockedGetProjectConfiguration = vi.mocked(getProjectConfiguration);
        const projectConfiguration = new YamlProjectConfiguration(
            "test",
            "us-east-1",
            Language.js,
            new YamlSdkConfiguration(Language.js, "./test.js"),
            CloudProviderIdentifier.GENEZIO,
            [],
        );
        projectConfiguration.addClass = vi.fn();
        projectConfiguration.writeToFile = vi.fn();
        mockedGetProjectConfiguration.mockResolvedValue(projectConfiguration);

        await expect(addClassCommand("./test.js", "jsonrpc")).resolves.toBeUndefined();

        expect(mockedFileExists).toBeCalledTimes(1);
        expect(mockedWriteToFile).toBeCalledTimes(2);
    });

    test("create class with existing file", async () => {
        const mockedFileExists = vi.mocked(fileExists);
        mockedFileExists.mockResolvedValue(true);

        const mockedWriteToFile = vi.mocked(writeToFile);
        mockedWriteToFile.mockResolvedValue();

        const mockedGetProjectConfiguration = vi.mocked(getProjectConfiguration);
        const projectConfiguration = new YamlProjectConfiguration(
            "test",
            "us-east-1",
            Language.js,
            new YamlSdkConfiguration(Language.js, "./test.js"),
            CloudProviderIdentifier.GENEZIO,
            [],
        );
        projectConfiguration.addClass = vi.fn();
        projectConfiguration.writeToFile = vi.fn();
        mockedGetProjectConfiguration.mockResolvedValue(projectConfiguration);

        await expect(addClassCommand("./test.js", "jsonrpc")).resolves.toBeUndefined();

        expect(mockedFileExists).toBeCalledTimes(1);
        expect(mockedWriteToFile).toBeCalledTimes(1);
    });
});
