import { beforeEach, test, expect, vi } from "vitest";
import axios from "axios";
import { getAuthToken } from "../../src/utils/accounts";
import { getPresignedURL } from "../../src/requests/getPresignedURL";

vi.mock("axios");
vi.mock("../../src/utils/accounts");

const mockedAxios = vi.mocked(axios);
const mockedGetAuthToken = vi.mocked(getAuthToken);

beforeEach(() => {
    mockedGetAuthToken.mockClear();
});

test("should throw error if server returns error", async () => {
    await expect(async () => {
        mockedGetAuthToken.mockResolvedValue("token");
        mockedAxios.mockResolvedValue(Promise.reject("Something went wrong"));

        await getPresignedURL("us-east-1", "genezioDeploy.zip", "test", "test");
    }).rejects.toThrowError();
});

test("should throw error if server returns data.error object", async () => {
    await expect(async () => {
        mockedGetAuthToken.mockResolvedValue("token");
        mockedAxios.mockResolvedValue(Promise.reject("Something went wrong"));

        await getPresignedURL("us-east-1", "genezioDeploy.zip", "test", "test");
    }).rejects.toThrowError();
});

test("should throw error if parameters are missing", async () => {
    await expect(async () => {
        mockedGetAuthToken.mockResolvedValue("token");

        await getPresignedURL("us-east-1", "genezioDeploy.zip", "", "");
    }).rejects.toThrowError();
});

test("should return presignedURL if everything is ok", async () => {
    const expectedPresignedURL = "https://myURL";
    const apiResponse = { status: "ok", presignedURL: expectedPresignedURL };

    mockedGetAuthToken.mockResolvedValue("token");
    mockedAxios.mockResolvedValue({
        data: apiResponse,
        status: 200,
        statusText: "Ok",
        headers: {},
        config: {},
    });

    const response = await getPresignedURL("us-east-1", "genezioDeploy.zip", "test", "test");

    expect(response).toEqual(expectedPresignedURL);
});

test("should read token and pass it to headers", async () => {
    const expectedPresignedURL = "https://myURL";
    const apiResponse = { status: "ok", presignedURL: expectedPresignedURL };

    mockedGetAuthToken.mockResolvedValue("token");
    mockedAxios.mockResolvedValue({
        data: apiResponse,
        status: 200,
        statusText: "Ok",
        headers: {},
        config: {},
    });

    const response = await getPresignedURL("us-east-1", "genezioDeploy.zip", "test", "test");

    expect(mockedGetAuthToken.mock.calls.length).toBe(1);

    expect(response).toEqual(expectedPresignedURL);
});

test("should throw error if auth token is missing", async () => {
    await expect(async () => {
        mockedGetAuthToken.mockResolvedValue("");

        await getPresignedURL("us-east-1", "genezioDeploy.zip", "test", "test");
    }).rejects.toThrowError();
});
