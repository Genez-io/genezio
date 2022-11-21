import FormData from "form-data";
import fs from "fs";
import axios, { AxiosError } from "axios";
import { getFileDetails, readToken } from "../utils/file";
import { GENERATE_SDK_API_URL } from "../variables";
import { ClassConfiguration, ProjectConfiguration } from "../models/projectConfiguration";
import { exit } from "process";

export default async function generateSdk(
  configuration: ProjectConfiguration,
  urlMap?: any
) {
  const classes = configuration.classes;

  const form = new FormData();
  form.append(
    "projectConfiguration",
    JSON.stringify(configuration)
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

  classes.forEach((classElem: ClassConfiguration) => {
    const filePath = classElem.path;
    const { name } = getFileDetails(filePath);

    form.append(name, fs.createReadStream(filePath));
  });

  const response: any = await axios({
    method: "post",
    url: `${GENERATE_SDK_API_URL}/js/generateSdk`,
    data: form,
    timeout: 100000,
    headers: { ...form.getHeaders(), Authorization: `Bearer ${authToken}` }
  }).catch((error: Error) => {
    throw error;
  });

  if (response.data?.error?.message) {
    if(response.data.error.message === 'Unauthorized'){
      console.log("You are not logged in or your token is invalid. Please run `genezio login` before you deploy your function.")
      exit(1)     
    }
    else{
      throw new Error(response.data.error.message);
    }
  }

  return response.data;
}
