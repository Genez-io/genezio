import fs from "fs";
import os from "os";
import path from "path";
import FileDetails from "../models/fileDetails.js";
import glob from "glob";
import archiver from "archiver";
import { parse } from "yaml";
import { exit } from "process";
import awsCronParser from "aws-cron-parser";
import { log } from "./logging.js";
import { promises as fsPromises, Dirent } from "fs";
import { debugLogger } from "./logging.js";
import { EnvironmentVariable } from "../models/environmentVariables.js";
import dotenv from "dotenv";
import fsExtra from "fs-extra";
import packageManager from "../packageManagers/packageManager.js";

export async function getAllFilesRecursively(folderPath: string): Promise<string[]> {
    let files: string[] = [];
    const items = await fsPromises.readdir(folderPath, { withFileTypes: true });

    for (const item of items) {
        if (item.isDirectory()) {
            files = [...files, ...(await getAllFilesRecursively(path.join(folderPath, item.name)))];
        } else {
            files.push(path.join(folderPath, item.name));
        }
    }

    return files;
}

export function ensureRelativePaths(file: string): string {
    if (file.startsWith("!")) {
        // negated patterns are passed through
        return "!" + ensureRelativePaths(file.substring(1));
    }

    if (file.endsWith(path.sep)) {
        // user probably wants to include all files in the directory
        return ensureRelativePaths(path.join(file, "./**"));
    }

    const absolutePath = path.resolve(file);
    const relativePath = path.relative(".", absolutePath);
    return relativePath;
}

export async function getAllFilesFromPath(
    inputPath: string,
    recursive: boolean = true,
): Promise<FileDetails[]> {
    // get genezioIgnore file
    let genezioIgnore: string[] = [];
    const genezioIgnorePath = path.join(inputPath, ".genezioignore");
    if (fs.existsSync(genezioIgnorePath)) {
        const genezioIgnoreContent = await readUTF8File(genezioIgnorePath);
        genezioIgnore = genezioIgnoreContent
            .split(os.EOL)
            .filter((line) => line !== "" && !line.startsWith("#"));
    }

    genezioIgnore = genezioIgnore.map((p) => ensureRelativePaths(p));

    return new Promise((resolve, reject) => {
        let pattern;
        if (recursive) {
            pattern = `**`;
        } else {
            pattern = `*`;
        }
        glob(
            pattern,
            {
                dot: true,
                ignore: genezioIgnore,
                cwd: inputPath,
            },
            (err, files) => {
                if (err) {
                    reject(err);
                }

                const fileDetails: FileDetails[] = files.map((file: string) => {
                    return {
                        name: path.parse(file).name,
                        extension: path.parse(file).ext,
                        path: file,
                        filename: file,
                    };
                });
                resolve(fileDetails);
            },
        );
    });
}

export async function getAllFilesFromCurrentPath(
    recursive: boolean = true,
): Promise<FileDetails[]> {
    return getAllFilesFromPath(process.cwd(), recursive);
}

export async function zipDirectory(sourceDir: string, outPath: string): Promise<void> {
    const archive = archiver("zip", { zlib: { level: 9 } });
    const stream = fs.createWriteStream(outPath);

    return new Promise((resolve, reject) => {
        archive
            .directory(sourceDir, false)
            .on("error", (err) => reject(err))
            .pipe(stream);

        stream.on("close", () => resolve());
        archive.finalize();
    });
}

export async function zipFile(sourcePath: string, outPath: string): Promise<void> {
    const archive = archiver("zip", { zlib: { level: 9 } });
    const stream = fs.createWriteStream(outPath);

    return new Promise((resolve, reject) => {
        archive
            .file(sourcePath, { name: path.basename(sourcePath) })
            .on("error", (err) => reject(err))
            .pipe(stream);

        stream.on("close", () => resolve());
        archive.finalize();
    });
}

export async function zipDirectoryToDestinationPath(
    sourceDir: string,
    destinationPath: string,
    outPath: string,
): Promise<void> {
    const archive = archiver("zip", { zlib: { level: 9 } });
    const stream = fs.createWriteStream(outPath);

    return new Promise((resolve, reject) => {
        archive
            .directory(sourceDir, destinationPath)
            .on("error", (err) => reject(err))
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
            } else {
                return resolve(false);
            }
        });
    });
}

export async function isDirectoryEmpty(directoryPath: string): Promise<boolean> {
    return new Promise((resolve) => {
        fs.readdir(directoryPath, (error, files) => {
            if (error) {
                resolve(true);
            }

            resolve(files.length === 0);
        });
    });
}

export async function directoryContainsHtmlFiles(directoryPath: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
        fs.readdir(directoryPath, (error, files) => {
            if (error) {
                reject(error);
            }

            resolve(files.some((file) => file.endsWith(".html")));
        });
    });
}

export async function getFileSize(filePath: string): Promise<number> {
    return new Promise((resolve, reject) => {
        fs.stat(filePath, (error, stats) => {
            if (error) {
                reject(error);
            }

            resolve(stats.size);
        });
    });
}

export async function getBundleFolderSizeLimit(directoryPath: string): Promise<number> {
    const files = await getAllFilesRecursively(directoryPath);
    const totalSize = files.reduce((acc, file) => acc + fs.statSync(file).size, 0);
    debugLogger.debug(`Total size of the bundle: ${totalSize} bytes`);
    return totalSize;
}

export async function directoryContainsIndexHtmlFiles(directoryPath: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
        fs.readdir(directoryPath, (error, files) => {
            if (error) {
                reject(error);
            }

            resolve(files.some((file) => file === "index.html"));
        });
    });
}

/**
 * Deletes a folder and its contents.
 * If the DEBUG environment variable is set to true, the folder will not be removed.
 * @param folderPath - The path of the folder to delete.
 * @returns A promise that resolves when the folder is deleted.
 */
export async function deleteFolder(folderPath: string): Promise<void> {
    if (process.env["DEBUG"] === "true") {
        debugLogger.debug(`DEBUG is set to true. Skipping deletion of ${folderPath}.`);
        return;
    }

    return fs.rmSync(folderPath, { recursive: true, force: true });
}

/**
 * Creates a temporary folder with a given name or a random name of 6 characters if no name is provided.
 * The folder is created inside a parent folder with a unique name based on the current process ID.
 * If the folder already exists, it will not be created again.
 * @param name - Optional name for the temporary folder.
 * @param shouldDeleteContents - Optional flag to delete the contents of the folder if it already exists.
 * @returns A promise that resolves with the path of the created folder.
 */
export async function createTemporaryFolder(
    name?: string,
    shouldDeleteContents?: boolean,
): Promise<string> {
    return new Promise((resolve, reject) => {
        const folderName = `genezio-${process.pid}`;

        if (!fs.existsSync(path.join(os.tmpdir(), folderName))) {
            fs.mkdirSync(path.join(os.tmpdir(), folderName));
        }

        if (name === undefined) {
            // Generate a random name of 6 characters
            name = Math.random().toString(36).substring(2, 8);
        }

        const tempFolder = path.join(os.tmpdir(), folderName, name);
        if (fs.existsSync(tempFolder)) {
            if (shouldDeleteContents) {
                fs.rmSync(tempFolder, { recursive: true });
            } else {
                resolve(tempFolder);
                return;
            }
        }

        fs.mkdir(tempFolder, (error) => {
            if (error) {
                reject(error);
            }

            resolve(tempFolder);
        });
    });
}

export async function createLocalTempFolder(
    name?: string,
    shouldDeleteContents?: boolean,
): Promise<string> {
    return new Promise((resolve, reject) => {
        const folderName = `local-genezio`;

        if (!fs.existsSync(path.join(os.tmpdir(), folderName))) {
            fs.mkdirSync(path.join(os.tmpdir(), folderName));
        }

        // install @types/node in root folder to be accessible by all projects
        if (!fs.existsSync(path.join(os.tmpdir(), folderName, "node_modules", "@types/node"))) {
            packageManager.installSync(["@types/node"], path.join(os.tmpdir(), folderName));
        }

        if (name === undefined) {
            // Generate a random name of 6 characters
            name = Math.random().toString(36).substring(2, 8);
        }

        const tempFolder = path.join(os.tmpdir(), folderName, name);
        if (fs.existsSync(tempFolder)) {
            if (shouldDeleteContents) {
                fsExtra.emptyDirSync(tempFolder);
                resolve(tempFolder);
            } else {
                resolve(tempFolder);
                return;
            }
        } else {
            fs.mkdir(tempFolder, (error) => {
                if (error) {
                    reject(error);
                }
                resolve(tempFolder);
            });
        }
    });
}

export async function deleteFile(filePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
        try {
            fs.rmSync(filePath);
        } catch (error) {
            reject(error);
        }

        resolve();
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
    content: string | NodeJS.ArrayBufferView,
    createPathIfNeeded = false,
): Promise<void> {
    return new Promise((resolve, reject) => {
        const fullPath = path.join(folderPath, filename);

        if (!fs.existsSync(path.dirname(fullPath)) && createPathIfNeeded) {
            fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        }

        // create the file if it doesn't exist
        fs.writeFile(fullPath, content, function (error) {
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
        return false;
    }
    return true;
}

export async function validateYamlFile() {
    const configurationFileContentUTF8 = await readUTF8File("./genezio.yaml");

    let configurationFileContent = null;

    try {
        configurationFileContent = await parse(configurationFileContentUTF8);
    } catch (error) {
        throw new Error(`The configuration yaml file is not valid.\n${error}`);
    }

    if (configurationFileContent.classes.length === 0) {
        log.info(
            "You don't have any classes in your genezio.yaml file. You can add classes using the 'genezio addClass <className> <classType>' command.",
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
                        `You need to specify a cronString for the method ${elem.path}.${method.name}.`,
                    );
                    exit(1);
                } else {
                    try {
                        awsCronParser.parse(method.cronString);
                    } catch (error) {
                        log.error(
                            `The cronString ${method.cronString} for the method ${elem.path}.${method.name} is not valid.`,
                        );
                        log.error("You must use a 6-part cron expression.");
                        if (error instanceof Error) {
                            log.error(error.toString());
                        }
                        exit(1);
                    }
                }
            }
        }
    }
}

export async function readEnvironmentVariablesFile(
    envFilePath: string,
): Promise<EnvironmentVariable[]> {
    const envVars = new Array<EnvironmentVariable>();

    // Read environment variables from .env file
    const dotenvVars = dotenv.config({ path: envFilePath }).parsed;
    if (!dotenvVars) {
        log.warn(`No environment variables found in ${envFilePath}.`);
    }

    for (const [key, value] of Object.entries(dotenvVars || {})) {
        envVars.push({ name: key, value: value });
    }
    return envVars;
}

export async function listFilesWithExtension(
    folderPath: string,
    fileExtension: string,
): Promise<string[]> {
    return fsPromises.readdir(folderPath, { withFileTypes: true }).then((dirents: Dirent[]) => {
        return dirents
            .filter(
                (dirent: Dirent) => dirent.isFile() && path.extname(dirent.name) === fileExtension,
            )
            .map((dirent: Dirent) => path.join(folderPath, dirent.name));
    });
}
