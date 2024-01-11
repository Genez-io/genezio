#!/usr/bin/env node

import { execSync } from "child_process";
import { log } from "console";

function checkForStatements(regex, message, exitCode) {
    const diff = execSync("git diff --cached").toString();
    if (new RegExp(regex).test(diff)) {
        log(message);
        process.exit(exitCode);
    }
}

try {
    // Check for console statements
    checkForStatements(
        "\\bconsole\\.",
        "ERROR: Found console statements in the git diff. Please remove them before committing.",
        1,
    );

    // Check for log statements
    checkForStatements(
        "\\blog\\.",
        "WARNING: Found log statements in the git diff. Please make sure they are wanted before committing. If they are, run commit with --no-verify / -n to skip this check.",
        1,
    );

    // Check for debugLogger statements
    checkForStatements(
        "\\bdebugLogger\\.",
        "WARNING: Found debugLogger statements in the git diff. Please make sure they are wanted before committing. If they are, run commit with --no-verify / -n to skip this check.",
        1,
    );
} catch (error) {
    process.exit(1);
}

// If no errors are found, allow the commit to proceed
process.exit(0);
