import { PackageManager } from "./packageManager.js";
import { exec, execSync } from "child_process";
import { promisify } from "util";
const asyncExec = promisify(exec);

export default class YarnPackageManager implements PackageManager {
    readonly command = "yarn";
    private version: string | undefined;

    async install(packages: string[] = [], cwd?: string) {
        // Yarn has two different commands for installing packages:
        // - `yarn install` will install all packages from the lockfile
        // - `yarn add` will install the specified packages and update the lockfile
        if (packages.length === 0) {
            await asyncExec(`yarn install`);
            return;
        }

        await asyncExec(`yarn add ${cwd ? `--cwd ${cwd}` : ""} ${packages.join(" ")}`);
    }

    installSync(packages: string[] = [], cwd?: string) {
        // Yarn has two different commands for installing packages:
        // - `yarn install` will install all packages from the lockfile
        // - `yarn add` will install the specified packages and update the lockfile
        if (packages.length === 0) {
            execSync(`yarn install`);
            return;
        }

        execSync(`yarn add ${cwd ? `--cwd ${cwd}` : ""} ${packages.join(" ")}`);
    }

    async link(packages: string[] = [], cwd?: string) {
        await asyncExec(`yarn link ${cwd ? `--cwd ${cwd}` : ""} ${packages.join(" ")}`);
    }

    async publish(cwd?: string) {
        await asyncExec(`yarn publish ${cwd ? `--cwd ${cwd}` : ""}`);
    }

    async addScopedRegistry(scope: string, url: string, authToken?: string) {
        throw new Error("Yarn scoped registry is not supported yet.");
    }

    async removeScopedRegistry(scope: string) {
        throw new Error("Yarn scoped registry is not supported yet.");
    }

    async getVersion(): Promise<string> {
        // Check if the version is already cached
        if (this.version !== undefined) {
            return this.version;
        }

        const { stdout } = await asyncExec("yarn --version");
        this.version = stdout.trim();
        return this.version;
    }
}
