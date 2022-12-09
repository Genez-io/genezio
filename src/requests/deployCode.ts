import path from "path";
import FormData from "form-data";
import fs from "fs";
import axios from "axios";
import { BACKEND_ENDPOINT } from "../variables";
import { ClassConfiguration } from "../models/projectConfiguration";
import log from "loglevel";
import { getAuthToken } from "../utils/accounts";

export async function deployClass(
  classConfiguration: ClassConfiguration,
  archivePath: string,
  projectName: string,
  className: string
) {
  if (!archivePath || !projectName || !className) {
    throw new Error("Missing required parameters");
  }

  // auth token
  const form = new FormData();
  const authToken = await getAuthToken()

  if (!authToken) {
    throw new Error(
      "You are not logged in. Run 'genezio login' before you deploy your function."
    );
  }

  form.append(
    "configurationClassContent",
    JSON.stringify(classConfiguration)
  );

  form.append("classFile", fs.createReadStream(classConfiguration.path));
  form.append("filename", path.parse(classConfiguration.path).name);
  form.append("archiveContent", fs.createReadStream(archivePath));
  form.append("projectName", projectName);
  form.append("className", className);

  const response: any = await axios({
    method: "POST",
    url: `${BACKEND_ENDPOINT}/project/deployment`, // TODO modify to http://api.genez.io/core/deployment
    data: form,
    headers: { ...form.getHeaders(), Authorization: `Bearer ${authToken}` },
    maxContentLength: Infinity,
    maxBodyLength: Infinity
  }).catch((error: Error) => {
    throw error;
  });

  if (response.data.status === "error") {
    throw new Error(response.data.message);
  }

  if (response.data?.error?.message) {
    throw new Error(response.data.error.message);
  }

  return response.data;
}
