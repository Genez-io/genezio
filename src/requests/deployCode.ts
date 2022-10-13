import path from "path";
import FormData from "form-data";
import fs from "fs";
import axios from "axios";
import { readToken } from "../utils/file";

export async function deployClass(
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
  var form = new FormData();
  const authToken = await readToken().catch(() => undefined);

  if (!authToken) {
    throw new Error(
      "We are currently in the early access phase of our project. Run 'genezio login <code>' before you deploy your function. If you don't have a code, contact us at contact@genez.io."
    );
  }

  form.append("classFile", fs.createReadStream(filePath));
  form.append("filename", path.parse(filePath).name);
  form.append("extension", extension);
  form.append("runtime", runtime);
  form.append("archiveContent", fs.createReadStream(archivePath));
  form.append("projectName", projectName);
  form.append("className", className);

  const response: any = await axios({
    method: "post",
    url: "http://localhost:8080/project/deployment",
    data: form,
    headers: { ...form.getHeaders(), Authorization: `Bearer ${authToken}` }
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
