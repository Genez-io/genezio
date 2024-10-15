import { PackageManager } from "./packageManager.js";
import { $ } from "execa";

export default class PoetryPackageManager implements PackageManager {
    readonly command = "poetry";
    private version: string | undefined;

    async install(packages: string[] = [], cwd?: string, _args?: string[]) {
        if (packages.length > 0) {
            await $({ cwd })`poetry add ${packages.join(" ")}`;
        } else {
            await $({ cwd })`poetry install`;
        }
    }

    async cleanInstall(cwd?: string, args?: string[]): Promise<void> {
        await $({ cwd })`poetry install ${args ?? []}`;
    }

    installSync(packages: string[] = [], cwd?: string) {
        if (packages.length > 0) {
            $({ cwd }).sync`poetry add ${packages.join(" ")}`;
        } else {
            $({ cwd }).sync`poetry install`;
        }
    }

    async link(packages: string[] = [], cwd?: string) {
        for (const pkg of packages) {
            await $({ cwd })`poetry add ${pkg} --editable`;
        }
    }

    async publish(cwd?: string) {
        await $({ cwd })`poetry publish --build`;
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

        const { stdout } = await $`poetry --version`;
        this.version = stdout.split(" ")[1].trim();
        return this.version;
    }

    async pack(cwd: string, destination: string): Promise<string> {
        await $({ cwd })`poetry build`;
        const { stdout } = await $({ cwd })`ls ${destination}`;
        return stdout.trim();
    }
}
