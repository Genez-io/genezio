import path from "path";
import FormData from "form-data";
import fs from "fs";
import axios from "axios";
import { readToken } from "../utils/file";
import { BACKEND_ENDPOINT } from "../variables";

export async function deployClass(
  configurationFileContent: any,
  filePath: string,
  extension: string,
  runtime: string,
  archivePath: string,
  projectName: string,
  className: string
) {
  if (!archivePath || !projectName || !className) {
    throw new Error("Missing required parameters");
  }

  // auth token
  const form = new FormData();
  const authToken = await readToken().catch(() => undefined);

  if (!authToken) {
    throw new Error(
      "You are not logged in. Run 'genezio login' before you deploy your function."
    );
  }

  form.append(
    "configurationClassContent",
    JSON.stringify(
      configurationFileContent.classes.find((c: any) => c.path === filePath)
    )
  );

  form.append("classFile", fs.createReadStream(filePath));
  form.append("filename", path.parse(filePath).name);
  form.append("extension", extension);
  form.append("runtime", runtime);
  form.append("archiveContent", fs.createReadStream(archivePath));
  form.append("projectName", projectName);
  form.append("className", className);

  const response: any = await axios({
    method: "post",
    url: `${BACKEND_ENDPOINT}/project/deployment`, // TODO modify to http://api.genez.io/core/deployment
    data: form,
    headers: { ...form.getHeaders(), Authorization: `Bearer ${authToken}` },
    maxContentLength: Infinity,
    maxBodyLength: Infinity
  }).catch((error: Error) => {
    console.log("error0");
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
