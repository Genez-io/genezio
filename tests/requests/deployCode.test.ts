import { beforeEach, test, expect, vi } from "vitest";
import axios from "axios";
import { getAuthToken } from "../../src/utils/accounts";
import { Language } from "../../src/models/yamlProjectConfiguration";
import { deployRequest } from "../../src/requests/deployCode";
import { ProjectConfiguration, SdkConfiguration } from "../../src/models/projectConfiguration";
import { CloudProviderIdentifier } from "../../src/models/cloudProviderIdentifier";

vi.mock("axios");
vi.mock("../../src/utils/accounts");

const mockedAxios = vi.mocked(axios);
const mockedGetAuthToken = vi.mocked(getAuthToken);

beforeEach(() => {
    mockedGetAuthToken.mockClear();
});

test("should throw error if server returns error", async () => {
    await expect(async () => {
        const projectConfiguration: ProjectConfiguration = {
            name: "test",
            region: "us-east-1",
            cloudProvider: CloudProviderIdentifier.GENEZIO,
            astSummary: {
                classes: [],
                version: "1.0.0",
            },
            sdk: new SdkConfiguration(Language.js, "./test"),
            classes: [],
        };

        mockedGetAuthToken.mockResolvedValue("token");
        mockedAxios.mockResolvedValue(Promise.reject("Something went wrong"));

        await deployRequest(projectConfiguration, "");
    }).rejects.toThrowError();
});

test("should throw error if server returns data.error object", async () => {
    await expect(async () => {
        const projectConfiguration: ProjectConfiguration = {
            name: "test",
            region: "us-east-1",
            cloudProvider: CloudProviderIdentifier.GENEZIO,
            astSummary: {
                classes: [],
                version: "1.0.0",
            },
            sdk: new SdkConfiguration(Language.js, "./test"),
            classes: [],
        };
        mockedGetAuthToken.mockResolvedValue("token");
        mockedAxios.mockResolvedValue(Promise.reject("Something went wrong"));

        await deployRequest(projectConfiguration, "");
    }).rejects.toThrowError();
});

test("should return response.data if everything is ok", async () => {
    const someObject = { someData: "data" };
    const projectConfiguration: ProjectConfiguration = {
        name: "test",
        region: "us-east-1",
        cloudProvider: CloudProviderIdentifier.GENEZIO,
        astSummary: {
            classes: [],
            version: "1.0.0",
        },
        sdk: new SdkConfiguration(Language.js, "./test"),
        classes: [],
    };
    mockedGetAuthToken.mockResolvedValue("token");
    mockedAxios.mockResolvedValue({
        data: someObject,
        status: 200,
        statusText: "Ok",
        headers: {},
        config: {},
    });

    const response = await deployRequest(projectConfiguration, "");
    expect(response).toEqual(someObject);
});

test("should read token and pass it to headers", async () => {
    const someObject = { someData: "data" };
    const projectConfiguration: ProjectConfiguration = {
        name: "test",
        region: "us-east-1",
        cloudProvider: CloudProviderIdentifier.GENEZIO,
        astSummary: {
            classes: [],
            version: "1.0.0",
        },
        sdk: new SdkConfiguration(Language.js, "./test"),
        classes: [],
    };
    mockedGetAuthToken.mockResolvedValue("token");
    mockedAxios.mockResolvedValue({
        data: someObject,
        status: 200,
        statusText: "Ok",
        headers: {},
        config: {},
    });

    const response = await deployRequest(projectConfiguration, "");

    expect(mockedGetAuthToken.mock.calls.length).toBe(1);

    expect(response).toEqual(someObject);
});
