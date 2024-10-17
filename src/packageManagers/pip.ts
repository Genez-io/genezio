import { PackageManager } from "./packageManager.js";
import { $ } from "execa";

export default class PipPackageManager implements PackageManager {
    readonly command = "pip";
    private version: string | undefined;
    private pythonCommand: string = "python"; // Default command

    async install(packages: string[] = [], cwd?: string, _args?: string[]) {
        await $({ cwd })`pip install ${packages.join(" ")}`;
    }

    async cleanInstall(cwd?: string, args?: string[]): Promise<void> {
        await $({ cwd })`pip install ${args ?? []}`;
    }

    installSync(packages: string[] = [], cwd?: string) {
        $({ cwd }).sync`pip install ${packages.join(" ")}`;
    }

    async link(packages: string[] = [], cwd?: string) {
        await $({ cwd })`pip install -e ${packages.join(" ")}`;
    }

    // TODO Implement publish when we support it
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async publish(cwd?: string) {
        return;
    }

    // TODO Implement addScopedRegistry and removeScopedRegistry when we support it
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async addScopedRegistry(url: string, authToken?: string) {
        return;
    }

    async removeScopedRegistry(): Promise<void> {
        return;
    }

    async getVersion(): Promise<string> {
        if (this.version !== undefined) {
            return this.version;
        }

        const { stdout } = await $`pip --version`;
        this.version = stdout.split(" ")[1].trim();
        return this.version;
    }

    async pack(cwd: string, destination: string): Promise<string> {
        // Use the detected python command (either `python` or `python3`)
        await $({ cwd })`${this.pythonCommand} setup.py sdist --dist-dir ${destination}`;
        const { stdout } = await $({ cwd })`ls ${destination}`;
        return stdout.trim();
    }
}
