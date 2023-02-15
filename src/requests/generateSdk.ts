import FormData from "form-data";
import fs from "fs";
import axios from "./axios";
import { fileExists } from "../utils/file";
import { GENERATE_SDK_API_URL } from "../variables";
import {
  YamlClassConfiguration,
  YamlProjectConfiguration
} from "../models/yamlProjectConfiguration";
import { printAdaptiveLog } from "../utils/logging"
import log from "loglevel";
import { getAuthToken } from "../utils/accounts";
import { GenerateSdkResponse } from "../models/generateSdkResponse";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pjson = require("../../package.json");

export default async function generateSdkRequest(
  configuration: YamlProjectConfiguration
): Promise<GenerateSdkResponse> {
  const classes = configuration.classes;
  const sdkOutputPath = configuration.sdk.path

  // check if the output path exists
  if (await fileExists(configuration.sdk.path)) {
    // delete the output path
    fs.rmSync(sdkOutputPath, { recursive: true, force: true });
  }

  const form = new FormData();
  form.append("projectConfiguration", JSON.stringify(configuration));

  const authToken = await getAuthToken();

  if (!authToken) {
    throw new Error(
      "You are not logged in. Run 'genezio login' before you deploy your function."
    );
  }

  classes.forEach((classElem: YamlClassConfiguration) => {
    const filePath = classElem.path;

    form.append(filePath, fs.createReadStream(filePath));
  });

  const sectionMessage = "Generating your SDK";
  printAdaptiveLog(sectionMessage, "start");
  const response: any = await axios({
    method: "post",
    url: `${GENERATE_SDK_API_URL}/js/generateSdk`,
    data: form,
    timeout: 100000,
    headers: {
      ...form.getHeaders(),
      Authorization: `Bearer ${authToken}`,
      "Accept-Version": `genezio-cli/${pjson.version}`
    }
  }).catch((error: Error) => {
    printAdaptiveLog(sectionMessage, "error");
    throw error;
  });

  printAdaptiveLog(sectionMessage, "end");

  if (response.data?.error?.message) {
    throw new Error(response.data.error.message);
  }

  return response.data;
}
