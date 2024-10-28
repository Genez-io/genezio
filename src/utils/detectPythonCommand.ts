import { $ } from "execa";

export async function detectPythonCommand() {
    try {
        await $`python3 --version`;
        return "python3";
    } catch {
        try {
            await $`python --version`;
            return "python";
        } catch {
            return;
        }
    }
}

export async function detectPipCommand() {
    try {
        await $`pip3 --version`;
        return "pip3";
    } catch {
        try {
            await $`pip --version`;
            return "pip";
        } catch {
            return;
        }
    }
}
