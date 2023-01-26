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
    mockedAxios.mockResolvedValue({
      data: { status: "error" },
      status: 200,
      statusText: "Ok",
      headers: {},
      config: {}
    });

    await uploadContentToS3("test", "test.zip");
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

    await uploadContentToS3("test", "test.zip");
  }).rejects.toThrowError();
});

test ("should throw error if presigned URL is missing", async () =>{
  await expect(async () => {

    await uploadContentToS3("", "test.zip");
  }).rejects.toThrowError();
});

test ("should throw error if archive path is missing", async () =>{
  await expect(async () => {

    await uploadContentToS3("test", "");
  }).rejects.toThrowError();
});

test("should return response.data if everything is ok", async () => {
  const someObject = { someData: "data" };

  mockedGetAuthToken.mockResolvedValue("token");
  mockedReadArchiveContent.readFileSync.mockReturnValue("test");
  mockedAxios.mockResolvedValue({
    data: someObject,
    status: 200,
    statusText: "Ok",
    headers: {},
    config: {}
  });

  const response = await uploadContentToS3("test", "test.zip");

  expect(response).toEqual(someObject);
});

test("should read token and pass it to headers", async () => {
  const someObject = { someData: "data" };

  mockedGetAuthToken.mockResolvedValue("token");
  mockedReadArchiveContent.readFileSync.mockReturnValue("test");
  mockedAxios.mockResolvedValue({
    data: someObject,
    status: 200,
    statusText: "Ok",
    headers: {},
    config: {}
  });

  const response = await uploadContentToS3("test", "test.zip");

  expect(mockedGetAuthToken.mock.calls.length).toBe(1);

  expect(response).toEqual(someObject);
});

test("should throw error if auth token is missing", async () => {
  await expect(async () => {
    mockedGetAuthToken.mockResolvedValue("");

    await uploadContentToS3("test", "test.zip");
  }).rejects.toThrowError();
});
