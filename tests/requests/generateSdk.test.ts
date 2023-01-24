import axios from "axios";
import {
  YamlClassConfiguration,
  JsRuntime,
  Language,
  YamlMethodConfiguration,
  YamlProjectConfiguration,
  YamlSdkConfiguration,
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
    const projectConfiguration = new YamlProjectConfiguration(
      "my_test",
      "us-east-1",
      new YamlSdkConfiguration(Language.js, JsRuntime.browser, "./path"),
      [
        new YamlClassConfiguration("./method.js", TriggerType.jsonrpc, "js", [
          new YamlMethodConfiguration("myTest", TriggerType.jsonrpc)
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

    await generateSdkRequest(projectConfiguration, {});
  }).rejects.toThrowError();
});

test("should return response.data if everything is ok", async () => {
  const returnedObject = { someObjectValue: "value" };
  const projectConfiguration = new YamlProjectConfiguration(
    "my_test",
    "us-east-1",
    new YamlSdkConfiguration(Language.js, JsRuntime.browser, "./path"),
    [
      new YamlClassConfiguration("./method.js", TriggerType.jsonrpc, "js", [
        new YamlMethodConfiguration("myTest", TriggerType.jsonrpc)
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

  const result = await generateSdkRequest(projectConfiguration, {});
  expect(result).toBe(returnedObject);
});
