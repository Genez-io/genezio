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

export async function detectPythonVersion(): Promise<string | undefined> {
    try {
        const { stdout } = await $`python3 --version`;
        return stdout.replace("Python ", "").trim();
    } catch {
        try {
            const { stdout } = await $`python --version`;
            return stdout.replace("Python ", "").trim();
        } catch {
            return;
        }
    }
}
