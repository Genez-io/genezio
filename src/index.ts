#! /usr/bin/env node

import program from "./genezio.js";
import { GenezioTelemetry, TelemetryEventTypes } from "./telemetry/telemetry.js";
import { cleanupTemporaryFolders } from "./utils/file.js";
import { SENTRY_DSN } from "./constants.js";
import { debugLogger } from "./utils/logging.js";
import { getProjectConfiguration } from "./utils/configuration.js";
import { stopDockerDatabase } from "./commands/local.js";

try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Sentry = await import("@sentry/node");
    const { ProfilingIntegration } = await import("@sentry/profiling-node");

    Sentry?.init({
        dsn: SENTRY_DSN,
        integrations: [new ProfilingIntegration()],
        // Performance Monitoring
        tracesSampleRate: 0.3,
        // Set sampling rate for profiling - this is relative to tracesSampleRate
        profilesSampleRate: 0.3,
    });
} catch (error: any) {
    debugLogger.debug("Sentry not initialized", error.message);
}

// Set-up SIGINT and exit handlers that clean up the temporary folder structure
process.on("SIGINT", async () => {
    GenezioTelemetry.sendEvent({
        eventType: TelemetryEventTypes.GENEZIO_CANCEL,
        errorTrace: "",
        commandOptions: "",
    });

    await stopDockerDatabase();
    await cleanupTemporaryFolders();
    process.exit();
});
process.on("exit", async () => {
    await stopDockerDatabase();
    await cleanupTemporaryFolders();
});

program.parse();
