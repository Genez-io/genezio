import { runNewProcess } from "./process.js";
import { ListrTaskWrapper, DefaultRenderer, delay } from "listr2";

export async function runScript(
    scripts: string | string[] | undefined,
    cwd: string,
    listr?: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        task: ListrTaskWrapper<any, typeof DefaultRenderer, any>;
        skipMessage?: string;
        errorMessage?: string;
    },
): Promise<void> {
    if (!scripts) {
        listr?.task.skip(listr.skipMessage || "No scripts to run");
        return;
    }

    if (!Array.isArray(scripts)) {
        scripts = [scripts];
    }
    if (listr?.task) {
        listr.task.output = `genezio`;
        await delay(100);
    }

    for (const script of scripts) {
        if (listr?.task) listr.task.output = `${script}`;
        await runNewProcess(script, cwd).catch((error) => {
            throw new Error(
                `${listr?.errorMessage || ""} ${error.message.replace(/^Command failed: /, "")}`,
            );
        });
    }
}
