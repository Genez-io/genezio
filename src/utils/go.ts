import { execSync } from "child_process";

export function checkIfGoIsInstalled() {
    const GoNotFoundError = `Error: Go not found`;

    // Check go version
    try {
        execSync("go version");
    } catch (error) {
        const goErr = new Error(GoNotFoundError);
        goErr.stack = "";
        throw goErr;
    }
}
