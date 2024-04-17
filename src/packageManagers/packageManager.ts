import NpmPackageManager from "./npm.js";
import PnpmPackageManager from "./pnpm.js";
import YarnPackageManager from "./yarn.js";

/*
 * An interface that describes the methods that a package manager must implement.
 */
export interface PackageManager {
    command: string;
    install(packages: string[], cwd?: string): Promise<void>;
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
}

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
};

/*
 * This is the currenly selected package manager.
 */
let packageManager = packageManagers.npm;

export function setPackageManager(packageManagerType: PackageManagerType) {
    packageManager = packageManagers[packageManagerType] ?? packageManagers.npm;
}

export default packageManager;
