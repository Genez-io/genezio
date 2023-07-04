#! /usr/bin/env node

import program from "./genezio.js";
import { cleanupTemporaryFolders } from "./utils/file.js";

// Set-up SIGINT and exit handlers that clean up the temporary folder structure
process.on('SIGINT', async () => {
    await cleanupTemporaryFolders();
    process.exit();
});
process.on('exit', async (code) => {
    await cleanupTemporaryFolders();
});

program.parse();
