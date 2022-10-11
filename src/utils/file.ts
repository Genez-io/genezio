import { rejects } from "assert";
import fs from "fs";
import os from "os";
import path from "path";
import FileDetails from "../models/fileDetails";
import glob from "glob";
import archiver from "archiver";

export async function getAllNonJsFiles(): Promise<FileDetails[]> {
  return new Promise((resolve, reject) => {
    glob(`./**/*`, { dot: true }, (err, files) => {
      if (err) {
        reject(err);
      }

      const fileDetails: FileDetails[] = files
        .filter((file: string) => {
          // filter js files, node_modules and folders
          return (
            path.extname(file) !== ".js" &&
            !file.includes("node_modules") &&
            !fs.lstatSync(file).isDirectory()
          );
        })
        .map((file: string) => {
          return {
            name: path.parse(file).name,
            extension: path.parse(file).ext,
            path: file,
            filename: file
          };
        });
      resolve(fileDetails);
    });
  });
}

export async function zipDirectory(
  sourceDir: string,
  outPath: string
): Promise<void> {
  const archive = archiver("zip", { zlib: { level: 9 } });
  const stream = fs.createWriteStream(outPath);

  return new Promise((resolve, reject) => {
    archive
      .directory(sourceDir, false)
      .on("error", (err: any) => reject(err))
      .pipe(stream);

    stream.on("close", () => resolve());
    archive.finalize();
  });
}

export async function fileExists(filePath: string): Promise<boolean> {
  return new Promise((resolve) => {
    fs.stat(filePath, (exists) => {
      if (exists == null) {
        return resolve(true);
      } else if (exists.code === "ENOENT") {
        return resolve(false);
      }
    });
  });
}

export async function createTemporaryFolder(
  name: string = "foo-"
): Promise<string> {
  return new Promise((resolve, reject) => {
    fs.mkdtemp(path.join(os.tmpdir(), name), (error: any, folder: string) => {
      if (error) {
        rejects(error);
      }

      resolve(folder);
    });
  });
}

export function getFileDetails(filePath: string): FileDetails {
  const { ext, name, dir, base } = path.parse(filePath);

  return new FileDetails(name, ext, dir, base);
}

export function readUTF8File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    fs.readFile("./genezio.yaml", "utf8", function (error, data) {
      if (error) {
        reject(error);
      }

      resolve(data);
    });
  });
}

export function writeToFile(
  folderPath: string,
  filename: string,
  content: any,
  createPathIfNeeded: boolean = false
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(folderPath) && createPathIfNeeded) {
      fs.mkdirSync(folderPath);
    }

    fs.writeFile(path.join(folderPath, filename), content, function (error) {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

export async function writeToken(token: string) {
  return writeToFile(os.homedir(), ".genezio", token, true);
}

export async function readToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    fs.readFile(
      path.join(os.homedir(), ".genezio"),
      "utf8",
      function (error, data) {
        if (error) {
          reject(error);
        }

        resolve(data);
      }
    );
  });
}
