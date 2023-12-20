import { compare } from "compare-versions";
import { PackageManager } from "./packageManager.js";
import { ExecOptions, exec, execSync, spawn } from "child_process";
import { promisify } from "util";
import { homedir } from "os";
const asyncExec = (cmd: string, options?: ExecOptions) =>
    promisify(exec)(cmd, options ?? { cwd: homedir() });

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
        if (compare(await this.getVersion(), "2.0.0", "<")) {
            throw new Error(
                "yarn v1 (classic) is not supported. Please update yarn to v2.0.0 or above.",
            );
        }

        const scopeConfig = {
            npmRegistryServer: url,
            npmAuthToken: authToken,
            npmAlwaysAuth: true,
        };
        await asyncExec(
            `yarn config set --home npmScopes.${scope} --json '${JSON.stringify(scopeConfig)}'`,
        );
    }

    async removeScopedRegistry(scope: string) {
        if (compare(await this.getVersion(), "2.0.0", "<")) {
            throw new Error(
                "yarn v1 (classic) is not supported. Please update yarn to v2.0.0 or above.",
            );
        }

        await asyncExec(`yarn config unset --home npmScopes.${scope}`);
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
