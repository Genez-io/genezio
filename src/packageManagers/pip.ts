import { PackageManager } from "./packageManager.js";
import { $ } from "execa";

export default class PipPackageManager implements PackageManager {
    readonly command = "pip";
    private version: string | undefined;

    async install(packages: string[] = [], cwd?: string) {
        await $({ cwd })`pip install ${packages.join(" ")}`;
    }

    installSync(packages: string[] = [], cwd?: string) {
        $({ cwd }).sync`pip install ${packages.join(" ")}`;
    }

    async link(packages: string[] = [], cwd?: string) {
        await $({ cwd })`pip install -e ${packages.join(" ")}`;
    }

    async publish(cwd?: string) {
        // For Python, publishing usually involves using `twine` to upload to PyPI
        await $({ cwd })`python setup.py sdist bdist_wheel`;
        await $({ cwd })`twine upload dist/*`;
    }

    async addScopedRegistry(url: string, authToken?: string) {
        // PIP usually does not handle scoped registries like npm, but we can handle custom indices
        await $`pip config set global.index-url ${url}`;
        if (authToken) {
            await $`pip config set global.extra-index-url ${url}`;
        }
    }

    async removeScopedRegistry(): Promise<void> {
        // Remove custom registries
        await $`pip config unset global.index-url`;
    }

    async getVersion(): Promise<string> {
        // Check if the version is already cached
        if (this.version !== undefined) {
            return this.version;
        }

        const { stdout } = await $`pip --version`;
        // Output is something like 'pip X.X.X from ... (python Y.Y)'
        this.version = stdout.split(" ")[1].trim();
        return this.version;
    }

    async pack(cwd: string, destination: string): Promise<string> {
        await $({ cwd })`python setup.py sdist --dist-dir ${destination}`;
        const { stdout } = await $({ cwd })`ls ${destination}`;
        return stdout.trim();
    }
}
