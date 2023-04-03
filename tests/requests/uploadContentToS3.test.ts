import axios from "axios";
import fs, { readFileSync } from "fs";
import { getAuthToken } from "../../src/utils/accounts";
import { uploadContentToS3 } from "../../src/requests/uploadContentToS3";

jest.mock("axios");
jest.mock("fs");
jest.mock("../../src/utils/accounts");

const mockedAxios = jest.mocked(axios, { shallow: true });
const mockedGetAuthToken = jest.mocked(getAuthToken, { shallow: true });
const mockedReadArchiveContent = jest.mocked(fs, { shallow: true });

beforeEach(() => {
  mockedGetAuthToken.mockClear();
});

test("should throw error if server returns error", async () => {
  await expect(async () => {
    mockedGetAuthToken.mockResolvedValue("token");
    mockedReadArchiveContent.readFileSync.mockReturnValue("test");
    const statSyncReturnValue: any = {size: BigInt(100)};
    mockedReadArchiveContent.statSync.mockReturnValue(statSyncReturnValue);
    mockedAxios.mockResolvedValue({
      data: { status: "error" },
      status: 200,
      statusText: "Ok",
      headers: {},
      config: {}
    });

    await uploadContentToS3("https://test.com", "test.zip");
  }).rejects.toThrowError();
});

test("should throw error if server returns data.error object", async () => {
  await expect(async () => {
    mockedGetAuthToken.mockResolvedValue("token");
    mockedReadArchiveContent.readFileSync.mockReturnValue("test");
    mockedAxios.mockResolvedValue({
      data: { error: { message: "error text" } },
      status: 200,
      statusText: "Ok",
      headers: {},
      config: {}
    });

    await uploadContentToS3("https://test.com", "test.zip");
  }).rejects.toThrowError();
});

test ("should throw error if presigned URL is missing", async () =>{
  await expect(async () => {

    await uploadContentToS3("", "test.zip");
  }).rejects.toThrowError();
});

test ("should throw error if archive path is missing", async () =>{
  await expect(async () => {

    await uploadContentToS3("https://test.com", "");
  }).rejects.toThrowError();
});

test("should throw error if auth token is missing", async () => {
  await expect(async () => {
    mockedGetAuthToken.mockResolvedValue("");

    await uploadContentToS3("https://test.com", "test.zip");
  }).rejects.toThrowError();
});
