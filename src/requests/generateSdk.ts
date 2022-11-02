import FormData from "form-data";
import fs from "fs";
import axios from "axios";
import { getFileDetails, readToken } from "../utils/file";
import { GENERATE_SDK_API_URL } from "../variables";

export default async function generateSdk(
  configurationFileContent: any,
  env: string,
  urlMap?: any
) {
  const classes = configurationFileContent.classes;
  const runtime = configurationFileContent.sdk.runtime;

  const form = new FormData();
  form.append("runtime", runtime);
  form.append("env", env);
  form.append(
    "configurationFileContent",
    JSON.stringify(configurationFileContent)
  );

  const authToken = await readToken().catch(() => undefined);

  if (!authToken) {
    throw new Error(
      "You are not logged in. Run 'genezio login' before you deploy your function."
    );
  }

  if (urlMap) {
    form.append("urlMap", JSON.stringify(urlMap));
  }

  classes.forEach((classElem: any) => {
    const filePath = classElem.path;
    const { name } = getFileDetails(filePath);

    form.append(name, fs.createReadStream(filePath));
  });

  const response: any = await axios({
    method: "post",
    url: `${GENERATE_SDK_API_URL}/js/generateSdk`,
    data: form,
    headers: { ...form.getHeaders(), Authorization: `Bearer ${authToken}` }
  }).catch((error: Error) => {
    throw error;
  });

  if (response.data?.error?.message) {
    throw new Error(response.data.error.message);
  }

  return response.data;
}
