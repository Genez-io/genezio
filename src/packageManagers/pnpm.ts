import { PackageManager } from "./packageManager.js";
import { ExecOptions, exec, execSync, spawn } from "child_process";
import { homedir } from "os";
import { promisify } from "util";
const asyncExec = (cmd: string, options?: ExecOptions) =>
    promisify(exec)(cmd, options ?? { cwd: homedir() });

export default class PnpmPackageManager implements PackageManager {
    readonly command = "pnpm";
    private version: string | undefined;

    async install(packages: string[] = [], cwd?: string) {
        // Pnpm has two different commands for installing packages:
        // - `pnpm install` will install all packages from the lockfile
        // - `pnpm add` will install the specified packages and update the lockfile
        if (packages.length === 0) {
            await asyncExec(`pnpm install`);
            return;
        }

        await asyncExec(`pnpm add ${cwd ? `--dir ${cwd}` : ""} ${packages.join(" ")}`);
    }

    installSync(packages: string[] = [], cwd?: string) {
        // Pnpm has two different commands for installing packages:
        // - `pnpm install` will install all packages from the lockfile
        // - `pnpm add` will install the specified packages and update the lockfile
        if (packages.length === 0) {
            execSync(`pnpm install`);
            return;
        }

        execSync(`pnpm add ${cwd ? `--dir ${cwd}` : ""} ${packages.join(" ")}`);
    }

    async link(packages: string[] = [], cwd?: string) {
        await asyncExec(`pnpm link ${cwd ? `--dir ${cwd}` : ""} ${packages.join(" ")}`);
    }

    async publish(cwd: string, publicPackage: boolean = true, customPackage: boolean = false) {
        return new Promise<void>((resolve, reject) => {
            const processElem = spawn(
                "pnpm",
                [
                    "publish",
                    cwd,
                    "--no-git-checks",
                    ...(publicPackage ? ["--access", "public"] : ["--access", "restricted"]),
                ],
                {
                    stdio: customPackage ? "inherit" : "ignore",
                    shell: process.platform == "win32",
                },
            );

            processElem.on("close", () => {
                resolve();
            });

            processElem.on("error", (error) => {
                reject(error);
            });

            processElem.on("exit", (code) => {
                if (code !== 0) {
                    reject(new Error(`Worker stopped with exit code ${code}`));
                }
            });
        });
    }

    async addScopedRegistry(scope: string, url: string, authToken?: string) {
        // Set the registry url for the specified scope
        await asyncExec(`pnpm config set @${scope}:registry=${url}`);

        if (authToken === undefined) {
            return;
        }

        // Add the authentication token for the registry hostname
        const registryUrl = new URL(url);
        const path = registryUrl.pathname.split("/").slice(0, -1).join("/");
        await asyncExec(
            `pnpm config set //${registryUrl.hostname}${path}/:_authToken=${authToken}`,
        );
    }

    async removeScopedRegistry(scope: string): Promise<void> {
        // Get the registry url for the specified scope
        const { stdout } = await asyncExec(`pnpm config get @${scope}:registry`);
        const registryUrl = new URL(stdout.trim());
        const path = registryUrl.pathname.split("/").slice(0, -1).join("/");

        // Remove the package scoped registry
        await asyncExec(`pnpm config delete @${scope}:registry`);

        // Remove the authentication token for the registry hostname
        await asyncExec(`pnpm config delete //${registryUrl.hostname}${path}/:_authToken`);
    }

    async getVersion(): Promise<string> {
        // Check if the version is already cached
        if (this.version !== undefined) {
            return this.version;
        }

        const { stdout } = await asyncExec("pnpm --version");
        this.version = stdout.trim();
        return this.version;
    }
}
