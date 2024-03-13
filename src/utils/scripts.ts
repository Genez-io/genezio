import { UserError } from "../errors.js";
import { runNewProcess } from "./process.js";

export async function runScript(
    scripts: string | string[] | undefined,
    cwd: string,
): Promise<void> {
    if (!scripts) {
        return;
    }

    if (!Array.isArray(scripts)) {
        scripts = [scripts];
    }

    for (const script of scripts) {
        // TODO: use execa instead of runNewProcess
        const success = await runNewProcess(script, cwd);
        if (!success) throw new UserError(`Failed to run script: ${script}`);
    }
}
