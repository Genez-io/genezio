#!/usr/bin/env node

import { execSync } from "child_process";
import { log } from "console";

try {
    const output = execSync("git status --porcelain").toString();

    // Check if src/constants.ts is modified
    if (!output.includes("src/constants.ts")) {
        log("src/constants.ts is not modified.");
        process.exit(0);
    } else {
        log("ERROR: src/constants.ts is modified.");
        process.exit(1);
    }
} catch (error) {
    log("An error occurred while running the script:", error);
    process.exit(1);
}
