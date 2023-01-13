import axios from "axios";
import {
  ClassConfiguration,
  JsRuntime,
  Language,
  MethodConfiguration,
  ProjectConfiguration,
  SdkConfiguration,
  TriggerType
} from "../../src/models/projectConfiguration";
import generateSdk from "../../src/requests/generateSdk";
import { getAuthToken } from "../../src/utils/accounts";

jest.mock("axios");
jest.mock("../../src/utils/accounts");

const mockedAxios = jest.mocked(axios, { shallow: true });
const mockedReadToken = jest.mocked(getAuthToken, { shallow: true });

beforeEach(() => {
  mockedReadToken.mockClear();
});

test("should throw error if server returns error", async () => {
  await expect(async () => {
    const projectConfiguration = new ProjectConfiguration(
      "my_test",
      "us-east-1",
      new SdkConfiguration(Language.js, JsRuntime.browser, "./path"),
      [
        new ClassConfiguration("./method.js", TriggerType.jsonrpc, "js", [
          new MethodConfiguration("myTest", TriggerType.jsonrpc)
        ])
      ]
    );

    mockedReadToken.mockResolvedValue("token");
    // mockedGetFileDetails.mockReturnValue({})
    mockedAxios.mockResolvedValue({
      data: { error: { message: "error" } },
      status: 400,
      statusText: "Ok",
      headers: {},
      config: {}
    });

    await generateSdk(projectConfiguration, {});
  }).rejects.toThrowError();
});

test("should return response.data if everything is ok", async () => {
  const returnedObject = { someObjectValue: "value" };
  const projectConfiguration = new ProjectConfiguration(
    "my_test",
    "us-east-1",
    new SdkConfiguration(Language.js, JsRuntime.browser, "./path"),
    [
      new ClassConfiguration("./method.js", TriggerType.jsonrpc, "js", [
        new MethodConfiguration("myTest", TriggerType.jsonrpc)
      ])
    ]
  );

  mockedReadToken.mockResolvedValue("token");
  // mockedGetFileDetails.mockReturnValue({})
  mockedAxios.mockResolvedValue({
    data: returnedObject,
    status: 200,
    statusText: "Ok",
    headers: {},
    config: {}
  });

  const result = await generateSdk(projectConfiguration, {});
  expect(result).toBe(returnedObject);
});
