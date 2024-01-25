import { execSync } from "child_process";

export function checkIfGoIsInstalled() {
    const GoNotFoundError = `Error: Go not found`;

    // Check go version
    try {
        execSync("go version");
    } catch (error) {
        const go_err = new Error(GoNotFoundError);
        go_err.stack = "";
        throw go_err;
    }
}
