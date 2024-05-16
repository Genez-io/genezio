import { Mutex } from "async-mutex";
import { debugLogger } from "../../utils/logging.js";
import { getPackageManager } from "../../packageManagers/packageManager.js";

/**
 * The `DependencyInstaller` class provides a thread-safe way to install dependencies for a Node.js project.
 * It keeps track of which dependencies have already been installed and only installs each dependency once.
 */
class DependencyInstaller {
    alreadyInstalled: Set<string> = new Set();
    mutex = new Mutex();

    static instance: DependencyInstaller = new DependencyInstaller();

    constructor() {
        return DependencyInstaller.instance;
    }

    /**
     * Installs the specified dependencies if they have not been installed yet.
     * This method is thread-safe and will only install dependencies once.
     * @param {string[]} dependencyList - The list of dependencies to install.
     * @param {boolean} [noSave] - If true, the installed dependencies will not be saved to the package.json file.
     * @returns {Promise<void>} A promise that resolves when all specified dependencies have been installed.
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async install(dependencyList: string[], cwd: string, noSave?: boolean): Promise<void> {
        const toBeInstalled: string[] = [];

        await this.mutex.runExclusive(async () => {
            dependencyList.forEach((dependency) => {
                if (!this.alreadyInstalled.has(dependency)) {
                    this.alreadyInstalled.add(dependency);
                    toBeInstalled.push(dependency);
                }
            });

            if (toBeInstalled.length === 0) {
                return;
            }

            debugLogger.debug(`Installing dependencies: ${toBeInstalled.join(", ")}`);
            // TODO: Add support for no-save for all package managers
            await getPackageManager().install(toBeInstalled, cwd);
        });
    }

    /**
     * Installs all dependencies that have not been installed yet.
     * This method is thread-safe and will only install dependencies once.
     * @returns {Promise<void>} A promise that resolves when all dependencies have been installed.
     */
    async installAll(cwd: string): Promise<void> {
        await this.mutex.runExclusive(async () => {
            debugLogger.debug(`Installing all dependencies`);
            await getPackageManager().install([], cwd);
        });
    }
}

export { DependencyInstaller };
