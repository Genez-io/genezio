#! /usr/bin/env node

import program from "./genezio.js";
import { GenezioTelemetry, TelemetryEventTypes } from "./telemetry/telemetry.js";
import { cleanupTemporaryFolders } from "./utils/file.js";


// Set-up SIGINT and exit handlers that clean up the temporary folder structure
process.on('SIGINT', async () => {
    GenezioTelemetry.sendEvent({eventType: TelemetryEventTypes.GENEZIO_CANCEL, errorTrace: "", commandOptions: ""});
    await cleanupTemporaryFolders();
    process.exit();
});
process.on('exit', async (code) => {
    await cleanupTemporaryFolders();
});

program.parse();
