#! /usr/bin/env node

import program from "./genezio.js";
import { GenezioTelemetry, TelemetryEventTypes } from "./telemetry/telemetry.js";
import { cleanupTemporaryFolders } from "./utils/file.js";
import { spawn } from 'child_process';
import log from "loglevel";
import { debugLogger } from "./utils/logging.js";

// Set-up SIGINT and exit handlers that clean up the temporary folder structure
process.on('SIGINT', async () => {
    GenezioTelemetry.sendEvent({eventType: TelemetryEventTypes.GENEZIO_CANCEL, errorTrace: "", commandOptions: ""});
    await cleanupTemporaryFolders();

    // Kill the entire process family
    const killCmd = process.platform === 'win32' ? 'taskkill' : 'kill';
    const signal = 'SIGINT';

    // Spawn a new process to kill the process family
    const killProcess = spawn(killCmd, [signal, `-${process.pid}`]);

    // Handle any errors during process termination
    killProcess.on('error', (err) => {
        debugLogger.debug('Error killing process family:', err);
    });

    // Listen for the process to exit
    killProcess.on('exit', (code, signal) => {
        debugLogger.debug('Process family killed with code:', code, 'and signal:', signal);
    });

    process.exit();
});
process.on('exit', async () => {
    await cleanupTemporaryFolders();
});

program.parse();
