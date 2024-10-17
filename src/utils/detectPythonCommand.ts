import { $ } from "execa";

export async function detectPythonCommand() {
    try {
        await $`python --version`;
        return "python";
    } catch {
        try {
            await $`python3 --version`;
            return "python3";
        } catch {
            return;
        }
    }
}
