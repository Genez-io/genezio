import { execSync } from "child_process";
import { UserError } from "../errors.js";

export function checkIfGoIsInstalled() {
    const GoNotFoundError = `Error: Go not found`;

    // Check go version
    try {
        execSync("go version");
    } catch (error) {
        const goErr = new UserError(GoNotFoundError);
        goErr.stack = "";
        throw goErr;
    }
}
