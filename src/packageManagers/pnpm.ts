import { PackageManager } from "./packageManager.js";
import { $ } from "execa";

export default class PnpmPackageManager implements PackageManager {
    readonly command = "pnpm";
    private version: string | undefined;

    async install(packages: string[] = [], cwd?: string, args: string[] = []) {
        // Pnpm has two different commands for installing packages:
        // - `pnpm install` will install all packages from the lockfile
        // - `pnpm add` will install the specified packages and update the lockfile
        if (packages.length === 0) {
            await $({ cwd })`pnpm install ${args}`;
            return;
        }

        await $({ cwd })`pnpm add ${args} ${packages}`;
    }

    async cleanInstall(cwd?: string, args: string[] = []) {
        await $({ cwd })`pnpm install --frozen-lockfile ${args}`;
    }

    installSync(packages: string[] = [], cwd?: string) {
        // Pnpm has two different commands for installing packages:
        // - `pnpm install` will install all packages from the lockfile
        // - `pnpm add` will install the specified packages and update the lockfile
        if (packages.length === 0) {
            $({ cwd }).sync`pnpm install`;
            return;
        }

        $({ cwd }).sync`pnpm add ${packages}`;
    }

    async link(packages: string[] = [], cwd?: string) {
        await $({ cwd })`pnpm link ${packages}`;
    }

    async publish(cwd?: string) {
        await $({ cwd })`pnpm publish --no-git-checks`;
    }

    async addScopedRegistry(scope: string, url: string, authToken?: string) {
        // Set the registry url for the specified scope
        await $`pnpm config set @${scope}:registry=${url}`;

        if (authToken === undefined) {
            return;
        }

        // Add the authentication token for the registry hostname
        const registryUrl = new URL(url);
        const path = registryUrl.pathname.split("/").slice(0, -1).join("/");
        await $`pnpm config set //${registryUrl.hostname}${path}/:_authToken=${authToken}`;
    }

    async removeScopedRegistry(scope: string): Promise<void> {
        // Get the registry url for the specified scope
        const { stdout } = await $`pnpm config get @${scope}:registry`;
        const registryUrl = new URL(stdout.trim());
        const path = registryUrl.pathname.split("/").slice(0, -1).join("/");

        // Remove the package scoped registry
        await $`pnpm config delete @${scope}:registry`;

        // Remove the authentication token for the registry hostname
        await $`pnpm config delete //${registryUrl.hostname}${path}/:_authToken`;
    }

    async getVersion(): Promise<string> {
        // Check if the version is already cached
        if (this.version !== undefined) {
            return this.version;
        }

        const { stdout } = await $`pnpm --version`;
        this.version = stdout.trim();
        return this.version;
    }

    async pack(cwd: string, destination: string): Promise<string> {
        const { stdout } = await $({ cwd })`pnpm pack --pack-destination ${destination}`;
        return stdout.trim();
    }
}
