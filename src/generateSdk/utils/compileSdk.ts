import { createRequire } from "module";
import { Language, YamlPublicSdkConfiguration } from "../../models/yamlProjectConfiguration.js";
import path from "path";
import ts from "typescript";
import { Worker } from "worker_threads";
import { writeToFile } from "../../utils/file.js";
import { GenezioCommand } from "../../utils/reporter.js";
import packageManager from "../../packageManagers/packageManager.js";

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
    environment: GenezioCommand,
    publicSdk?: YamlPublicSdkConfiguration,
) {
    // compile the sdk to cjs and esm using worker threads
    const workers = [];
    const require = createRequire(import.meta.url);
    const typescriptPath = path.resolve(require.resolve("typescript"));
    const cjsOptions = {
        outDir: path.resolve(sdkPath, "..", "genezio-sdk", "cjs"),
        module: ts.ModuleKind.CommonJS,
        rootDir: sdkPath,
        allowJs: true,
        declaration: true,
    };
    workers.push(
        createWorker(compilerWorkerScript, {
            fileNames: [path.join(sdkPath, `index.${language}`)],
            compilerOptions: cjsOptions,
            typescriptPath,
        }),
    );
    const esmOptions = {
        outDir: path.resolve(sdkPath, "..", "genezio-sdk", "esm"),
        module: ts.ModuleKind.ESNext,
        rootDir: sdkPath,
        allowJs: true,
        declaration: true,
    };
    workers.push(
        createWorker(compilerWorkerScript, {
            fileNames: [path.join(sdkPath, `index.${language}`)],
            compilerOptions: esmOptions,
            typescriptPath,
        }),
    );
    const modulePath = path.resolve(sdkPath, "..", "genezio-sdk");
    const writePackagePromise = writeToFile(modulePath, "package.json", packageJson, true);
    workers.push(writePackagePromise);
    await Promise.all(workers);
    if (environment === GenezioCommand.deploy) {
        if (publicSdk?.public) {
            await packageManager.publish(modulePath, publicSdk?.public, true);
        } else {
            await packageManager.publish(modulePath, false);
        }
    }
}
