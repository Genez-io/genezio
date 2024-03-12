import { cmp } from "semver";
import { PackageManager } from "./packageManager.js";
import { $ } from "execa";
import { UserError } from "../errors.js";

export default class YarnPackageManager implements PackageManager {
    readonly command = "yarn";
    private version: string | undefined;

    async install(packages: string[] = [], cwd?: string) {
        // Yarn has two different commands for installing packages:
        // - `yarn install` will install all packages from the lockfile
        // - `yarn add` will install the specified packages and update the lockfile
        if (packages.length === 0) {
            await $({ cwd })`yarn install`;
            return;
        }

        await $({ cwd })`yarn add ${packages}`;
    }

    installSync(packages: string[] = [], cwd?: string) {
        // Yarn has two different commands for installing packages:
        // - `yarn install` will install all packages from the lockfile
        // - `yarn add` will install the specified packages and update the lockfile
        if (packages.length === 0) {
            $({ cwd })`yarn install`;
            return;
        }

        $({ cwd })`yarn add ${packages}`;
    }

    async link(packages: string[] = [], cwd?: string) {
        await $({ cwd })`yarn link ${packages}`;
    }

    async publish(cwd?: string) {
        await $({ cwd })`yarn publish`;
    }

    async addScopedRegistry(scope: string, url: string, authToken?: string) {
        if (cmp(await this.getVersion(), "<", "2.0.0")) {
            throw new UserError(
                "yarn v1 (classic) is not supported. Please update yarn to v2.0.0 or above.",
            );
        }

        const scopeConfig = {
            npmRegistryServer: url,
            npmAuthToken: authToken,
            npmAlwaysAuth: true,
        };
        await $`yarn config set --home npmScopes.${scope} --json '${JSON.stringify(scopeConfig)}'`;
    }

    async removeScopedRegistry(scope: string) {
        if (cmp(await this.getVersion(), "<", "2.0.0")) {
            throw new UserError(
                "yarn v1 (classic) is not supported. Please update yarn to v2.0.0 or above.",
            );
        }

        await $`yarn config unset --home npmScopes.${scope}`;
    }

    async getVersion(): Promise<string> {
        // Check if the version is already cached
        if (this.version !== undefined) {
            return this.version;
        }

        const { stdout } = await $`yarn --version`;
        this.version = stdout.trim();
        return this.version;
    }
}
