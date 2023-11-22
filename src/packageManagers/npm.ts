import { PackageManager } from "./packageManager.js";
import { exec, execSync } from "child_process";
import { promisify } from "util";
const asyncExec = promisify(exec);

export default class NpmPackageManager implements PackageManager {
    readonly command = "npm";
    private version: string | undefined;

    async install(packages: string[] = [], cwd?: string) {
        await asyncExec(`npm install ${cwd ? `--prefix ${cwd}` : ""} ${packages.join(" ")}`);
    }

    installSync(packages: string[] = [], cwd?: string) {
        execSync(`npm install ${cwd ? `--prefix ${cwd}` : ""} ${packages.join(" ")}`);
    }

    async link(packages: string[] = [], cwd?: string) {
        await asyncExec(`npm link ${cwd ? `--prefix ${cwd}` : ""} ${packages.join(" ")}`);
    }

    async publish(cwd?: string) {
        await asyncExec(`npm publish ${cwd ?? ""}`);
    }

    async addScopedRegistry(scope: string, url: string, authToken?: string) {
        // Set the registry url for the specified scope
        await asyncExec(`npm config set @${scope}:registry=${url}`);

        if (authToken === undefined) {
            return;
        }

        // Add the authentication token for the registry hostname
        const registryUrl = new URL(url);
        await asyncExec(`npm config set //${registryUrl.hostname}/:_authToken=${authToken}`);
    }

    async removeScopedRegistry(scope: string): Promise<void> {
        // Get the registry url for the specified scope
        const { stdout } = await asyncExec(`npm config get @${scope}:registry`);
        const registryUrl = new URL(stdout.trim());

        // Remove the package scoped registry
        await asyncExec(`npm config delete @${scope}:registry`);

        // Remove the authentication token for the registry hostname
        await asyncExec(`npm config delete //${registryUrl.hostname}/:_authToken`);
    }

    async getVersion(): Promise<string> {
        // Check if the version is already cached
        if (this.version !== undefined) {
            return this.version;
        }

        const { stdout } = await asyncExec("npm --version");
        this.version = stdout.trim();
        return this.version;
    }
}
