import { PackageManager } from "./packageManager.js";
import { $ } from "execa";
import { detectPipCommand } from "../utils/detectPythonCommand.js";

export default class PipPackageManager implements PackageManager {
    public command = "pip";
    private version: string | undefined;
    private pythonCommand: string = "python"; // Default Python command

    constructor() {
        this.init();
    }

    private async init() {
        // Detects either pip or pip3 and sets it as the command
        this.command = (await detectPipCommand()) ?? this.command;
    }

    async install(packages: string[], cwd?: string, args?: string[]): Promise<void> {
        await $({ cwd })`${this.command} install ${packages.join(" ")} ${args?.join(" ") ?? ""}`;
    }

    async cleanInstall(cwd?: string, args?: string[]): Promise<void> {
        await $({ cwd })`${this.command} install ${args?.join(" ") ?? ""}`;
    }

    installSync(packages: string[] = [], cwd?: string) {
        $({ cwd }).sync`${this.command} install ${packages.join(" ")}`;
    }

    async link(packages: string[] = [], cwd?: string) {
        await $({ cwd })`${this.command} install -e ${packages.join(" ")}`;
    }

    // TODO Implement publish when we support this functionality
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async publish(cwd?: string) {
        return;
    }

    // TODO Implement addScopedRegistry and removeScopedRegistry when we support this functionality
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

        const { stdout } = await $`${this.command} --version`;
        this.version = stdout.split(" ")[1].trim();
        return this.version;
    }

    async pack(cwd: string, destination: string): Promise<string> {
        // Uses the detected Python command (either `python` or `python3`)
        await $({ cwd })`${this.pythonCommand} setup.py sdist --dist-dir ${destination}`;
        const { stdout } = await $({ cwd })`ls ${destination}`;
        return stdout.trim();
    }
}
