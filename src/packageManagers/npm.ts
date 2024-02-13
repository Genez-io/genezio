import { PackageManager } from "./packageManager.js";
import { $ } from "execa";

export default class NpmPackageManager implements PackageManager {
    readonly command = "npm";
    private version: string | undefined;

    async install(packages: string[] = [], cwd?: string) {
        await $({ cwd })`npm install ${packages}`;
    }

    installSync(packages: string[] = [], cwd?: string) {
        $({ cwd }).sync`npm install ${packages}`;
    }

    async link(packages: string[] = [], cwd?: string) {
        await $({ cwd })`npm link ${packages}`;
    }


    async publish(cwd?: string) {
        await $({ cwd })`npm publish`;
    }

    async addScopedRegistry(scope: string, url: string, authToken?: string) {
        // Set the registry url for the specified scope
        await $`npm config set @${scope}:registry=${url}`;

        if (authToken === undefined) {
            return;
        }

        // Add the authentication token for the registry hostname
        const registryUrl = new URL(url);
        const path = registryUrl.pathname.split("/").slice(0, -1).join("/");
        await $`npm config set //${registryUrl.hostname}${path}/:_authToken=${authToken}`;
    }

    async removeScopedRegistry(scope: string): Promise<void> {
        // Get the registry url for the specified scope
        const { stdout } = await $`npm config get @${scope}:registry`;
        const registryUrl = new URL(stdout.trim());
        const path = registryUrl.pathname.split("/").slice(0, -1).join("/");

        // Remove the package scoped registry
        await $`npm config delete @${scope}:registry`;

        // Remove the authentication token for the registry hostname
        await $`npm config delete //${registryUrl.hostname}${path}/:_authToken`;
    }

    async getVersion(): Promise<string> {
        // Check if the version is already cached
        if (this.version !== undefined) {
            return this.version;
        }

        const { stdout } = await $`npm --version`;
        this.version = stdout.trim();
        return this.version;
    }
}
