import { createRequire } from "module";
import { Language } from "../../yamlProjectConfiguration/models.js";
import path from "path";
import ts from "typescript";
import { Worker } from "worker_threads";
import { deleteFolder, writeToFile } from "../../utils/file.js";
import fs from "fs";
import packageManager from "../../packageManagers/packageManager.js";
import { listFilesWithExtension } from "../../utils/listFilesWithExtension.js";

const compilerWorkerScript = `const { parentPort, workerData } = require("worker_threads");

const { compilerOptions, fileNames, typescriptPath } = workerData;
const ts = require(typescriptPath);

const compilerHost = ts.createCompilerHost(compilerOptions);
const program = ts.createProgram(fileNames, compilerOptions, compilerHost);
program.emit();

parentPort.postMessage("done");`;

function createWorker(workerScript: string, workerData: object) {
    return new Promise((resolve, reject) => {
        const worker = new Worker(workerScript, { workerData, eval: true });
        worker.on("message", resolve);
        worker.on("error", reject);
        worker.on("exit", (code) => {
            if (code !== 0) {
                reject(new Error(`Worker stopped with exit code ${code}`));
            }
        });
    });
}

export async function compileSdk(
    sdkPath: string,
    packageJson: string,
    language: Language,
    publish: boolean,
    outDir = "../genezio-sdk",
    overwriteIfExists = true,
) {
    const genezioSdkPath = path.resolve(sdkPath, outDir);
    // delete the old sdk
    if (overwriteIfExists) {
        if (fs.existsSync(genezioSdkPath)) {
            await deleteFolder(genezioSdkPath);
        }
    }
    fs.mkdirSync(genezioSdkPath, { recursive: true });
    let extension;
    if (language === Language.ts) {
        extension = ".ts";
    } else if (language === Language.js) {
        extension = ".js";
    } else {
        throw new Error("Language not supported");
    }
    const filenames = await listFilesWithExtension(sdkPath, extension);
    // compile the sdk to cjs and esm using worker threads
    const workers = [];
    const require = createRequire(import.meta.url);
    const typescriptPath = path.resolve(require.resolve("typescript"));
    const cjsOptions = {
        outDir: path.resolve(sdkPath, outDir, "cjs"),
        module: ts.ModuleKind.CommonJS,
        rootDir: sdkPath,
        include: "*.ts",
        allowJs: true,
        declaration: true,
    };
    workers.push(
        createWorker(compilerWorkerScript, {
            fileNames: filenames,
            compilerOptions: cjsOptions,
            typescriptPath,
        }),
    );
    const esmOptions = {
        outDir: path.resolve(sdkPath, outDir, "esm"),
        module: ts.ModuleKind.ESNext,
        rootDir: sdkPath,
        include: "*.ts",
        allowJs: true,
        declaration: true,
    };
    workers.push(
        createWorker(compilerWorkerScript, {
            fileNames: filenames,
            compilerOptions: esmOptions,
            typescriptPath,
        }),
    );
    const modulePath = path.resolve(sdkPath, outDir);
    const writePackagePromise = writeToFile(modulePath, "package.json", packageJson, true);
    workers.push(writePackagePromise);
    await Promise.all(workers);
    if (publish === true) {
        await packageManager.publish(modulePath);
    }
}
