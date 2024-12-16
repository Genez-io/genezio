import NpmPackageManager from "./npm.js";
import PnpmPackageManager from "./pnpm.js";
import YarnPackageManager from "./yarn.js";
import PipPackageManager from "./pip.js";
import PoetryPackageManager from "./poetry.js";

/*
 * An interface that describes the methods that a package manager must implement.
 */
export interface PackageManager {
    command: string;
    install(packages: string[], cwd?: string, args?: string[]): Promise<void>;
    cleanInstall(cwd?: string, args?: string[]): Promise<void>;
    installSync(packages: string[], cwd?: string): void;
    link(packages: string[], cwd?: string): Promise<void>;
    publish(cwd?: string): Promise<void>;
    addScopedRegistry(scope: string, url: string, authToken?: string): Promise<void>;
    removeScopedRegistry(scope: string): Promise<void>;
    getVersion(): Promise<string>;
    pack(cwd: string, outputPath: string): Promise<string>;
}

export enum PackageManagerType {
    npm = "npm",
    yarn = "yarn",
    pnpm = "pnpm",
    pip = "pip",
    poetry = "poetry",
}

export const NODE_DEFAULT_PACKAGE_MANAGER = PackageManagerType.npm;
export const PYTHON_DEFAULT_PACKAGE_MANAGER = PackageManagerType.pip;

/*
 * A mapping between package manager types and package manager instances.
 *
 * Note: This code is also used to warn if a package manager has been declared, but does not have
 * an implementation. (using the type checker)
 */
export const packageManagers: {
    [key in PackageManagerType]: PackageManager;
} = {
    npm: new NpmPackageManager(),
    yarn: new YarnPackageManager(),
    pnpm: new PnpmPackageManager(),
    pip: new PipPackageManager(),
    poetry: new PoetryPackageManager(),
};

/*
 * This is the currently selected package manager.
 *
 * Note: It should not be exported, as it is only used internally.
 * Use the getGlobalPackageManager and setGlobalPackageManager functions instead.
 */
let packageManager = packageManagers.npm;

// This will return a global package manager instance - the default is npm.
export function getGlobalPackageManager(): PackageManager {
    return packageManager;
}

// This will set the global package manager instance.
export function setGlobalPackageManager(packageManagerType: PackageManagerType) {
    packageManager = packageManagers[packageManagerType] ?? packageManagers.npm;
}
