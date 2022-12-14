import fs from "fs";
import os from "os";
import path from "path";
import FileDetails from "../models/fileDetails";
import glob from "glob";
import archiver from "archiver";
import { parse, Document } from "yaml";
import { exit } from "process";
import awsCronParser from "aws-cron-parser";
import log from "loglevel";

export async function getAllFilesFromCurrentPath(): Promise<FileDetails[]> {
  return new Promise((resolve, reject) => {
    glob(`./**/*`, { dot: true }, (err, files) => {
      if (err) {
        reject(err);
      }

      const fileDetails: FileDetails[] = files.map((file: string) => {
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

export async function createTemporaryFolder(name = "foo-"): Promise<string> {
  return new Promise((resolve, reject) => {
    fs.mkdtemp(path.join(os.tmpdir(), name), (error: any, folder: string) => {
      if (error) {
        reject(error);
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
    fs.readFile(filePath, "utf8", function (error, data) {
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
      fs.mkdirSync(folderPath, { recursive: true });
    }

    // create the file if it doesn't exist
    fs.writeFile(path.join(folderPath, filename), content, function (error) {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

export async function checkYamlFileExists(yamlPath = "./genezio.yaml") {
  if (!(await fileExists(yamlPath))) {
    log.error(
      "genezio.yaml file does not exist. Please run `genezio init` to initialize a project."
    );
    return false;
  }

  return true;
}

export async function validateYamlFile() {
  const configurationFileContentUTF8 = await readUTF8File("./genezio.yaml");
  const configurationFileContent = await parse(configurationFileContentUTF8);

  if (configurationFileContent.classes.length === 0) {
    log.info(
      "You don't have any classes in your genezio.yaml file. You can add classes using the 'genezio addClass <className> <classType>' command."
    );
    exit(1);
  }

  for (const elem of configurationFileContent.classes) {
    if (elem.methods === undefined) {
      continue;
    }
    for (const method of elem.methods) {
      if (method.type === "cron") {
        if (method.cronString === undefined) {
          log.warn(
            `You need to specify a cronString for the method ${elem.path}.${method.name}.`
          );
          exit(1);
        } else {
          try {
            const cron = awsCronParser.parse(method.cronString);
          } catch (error: any) {
            log.error(
              `The cronString ${method.cronString} for the method ${elem.path}.${method.name} is not valid.`
            );
            log.error("You must use a 6-part cron expression.");
            log.error(error.toString());
            exit(1);
          }
        }
      }
    }
  }
}
