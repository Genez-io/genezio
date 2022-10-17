import { rejects } from "assert";
import fs from "fs";
import os from "os";
import path from "path";
import FileDetails from "../models/fileDetails";
import glob from "glob";
import archiver from "archiver";
import keytar from "keytar";

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
            path.basename(file) !== "package.json" &&
            path.basename(file) !== "package-lock.json" &&
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
  name = "foo-"
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
  createPathIfNeeded = false
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

export async function readToken(): Promise<string> {
  // get credentials from keytar
  return new Promise((resolve, reject) => {
    keytar
      .findCredentials("genez.io")
      .then((credentials) => {
        if (credentials.length === 0) {
          console.log("You are not logged in. Please login first.");
          reject("No credentials found");
        }

        resolve(credentials[0].password);
      })
      .catch((error) => {
        reject(error);
      });
  });
}
