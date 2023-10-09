#! /usr/bin/env node

import program from "./genezio.js";
import { GenezioTelemetry, TelemetryEventTypes } from "./telemetry/telemetry.js";
import { cleanupTemporaryFolders } from "./utils/file.js";
import * as Sentry from "@sentry/node";
import { ProfilingIntegration } from "@sentry/profiling-node";
import { SENTRY_DSN } from "./constants.js";

Sentry.init({
  dsn: SENTRY_DSN,
  integrations: [
    new ProfilingIntegration(),
  ],
  // Performance Monitoring
  tracesSampleRate: 1.0, // Capture 100% of the transactions, reduce in production!
  // Set sampling rate for profiling - this is relative to tracesSampleRate
  profilesSampleRate: 1.0, // Capture 100% of the transactions, reduce in production!
});


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
