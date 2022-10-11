import path from "path";
import FormData from "form-data";
import fs from "fs";
import axios from "axios";
import BundledCode from "../models/bundledCode";
import { readToken } from "../utils/file";
import crypto from "crypto";

export async function finalizeDeploy(projectName: string, className: string) {
  const authToken = await readToken();
  const apiURL = `https://genezio.com/api/v1/projects/${projectName}/finalize-deploy`;
  const response = await axios.post(
    apiURL,
    {
      projectName,
      className
    },
    {
      headers: {
        Authorization: `Bearer ${authToken}`
      }
    }
  );

  if (response.status !== 200) {
    throw new Error("Failed to finalize deploy");
  }

  return response.data.functionUrl;
}

export async function uploadArchiveToS3(s3Link: string, archivePath: string) {
  const res = await axios.put(s3Link, fs.readFileSync(archivePath), {
    headers: {
      "Content-Type": "application/zip"
    }
  });

  if(res.status !== 200) {
    throw new Error("Upload failed");
  }

  return true;
}

export async function initializeDeploy(
  bundledCode: BundledCode,
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

  // get archive hash
  const fileBuffer = fs.readFileSync("archivePath");
  const hashSum = crypto.createHash("sha256");
  hashSum.update(fileBuffer);
  const archiveHash = hashSum.digest("hex");

  // get archive size
  const archiveSize = fs.statSync(archivePath).size;

  // auth token
  var form = new FormData();
  const authToken = await readToken().catch(() => undefined);

  if (!authToken) {
    throw new Error(
      "We are currently in the early access phase of our project. Run 'genezio login <code>' before you deploy your function. If you don't have a code, contact us at contact@genez.io."
    );
  }

  form.append("bundledFile", fs.createReadStream(bundledCode.path));
  form.append("file", fs.createReadStream(filePath));
  form.append("filename", path.parse(filePath).name);
  form.append("extension", extension);
  form.append("runtime", runtime);
  form.append("archiveHash", archiveHash);
  form.append("archiveSize", archiveSize);
  form.append("projectName", projectName);
  form.append("className", className);

  const response: any = await axios({
    method: "post",
    url: "https://haavwx62n4.execute-api.us-east-1.amazonaws.com/js/deploy",
    data: form,
    headers: { ...form.getHeaders(), Auhorization: `Bearer ${authToken}` }
  }).catch((error: Error) => {
    throw error;
  });

  if (response.data.status === "error") {
    throw new Error(response.data.message);
  }

  if (response.data?.error?.message) {
    throw new Error(response.data.error.message);
  }

  // return response.data.functionUrl;
  // return s3 link
  return response.data.s3Link;
}
