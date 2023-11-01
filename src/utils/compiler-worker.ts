export const compilerWorkerScript = `const ts = require("typescript");
const { parentPort, workerData } = require("worker_threads");

const { compilerOptions, fileNames } = workerData;

const compilerHost = ts.createCompilerHost(compilerOptions);
const program = ts.createProgram(fileNames, compilerOptions, compilerHost);
program.emit();

parentPort.postMessage("done");`;
