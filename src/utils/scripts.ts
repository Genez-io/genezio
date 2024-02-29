import { runNewProcess } from "./process.js";

export async function runScript(
    scripts: string | string[] | undefined,
    cwd: string,
): Promise<boolean> {
    if (!scripts) {
        return true;
    }

    if (!Array.isArray(scripts)) {
        scripts = [scripts];
    }

    for (const script of scripts) {
        // TODO: use execa instead of runNewProcess
        const success = await runNewProcess(script, cwd);
        if (!success) return false;
    }

    return true;
}
