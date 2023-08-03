import { Mutex } from 'async-mutex'
import { debugLogger } from '../../utils/logging.js';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import exec from 'await-exec';

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
    async install(dependencyList: string[], noSave?: boolean): Promise<void> {
        const toBeInstalled: string[] = [];

        await this.mutex.runExclusive(async () => {
            dependencyList.forEach((dependency) => {
                if (!this.alreadyInstalled.has(dependency)) {
                    this.alreadyInstalled.add(dependency);
                    toBeInstalled.push(dependency);
                }
            })

            if (toBeInstalled.length === 0) {
                return;
            }

            const baseCommand = this.getInstallPackageCommand(noSave);
            const command = baseCommand + " " + toBeInstalled.join(" ");
            debugLogger.debug("Running command: " + command);

            await exec(command);
        })
    }

    /**
     * Installs all dependencies that have not been installed yet.
     * This method is thread-safe and will only install dependencies once.
     * @returns {Promise<void>} A promise that resolves when all dependencies have been installed.
     */
    async installAll(): Promise<void> {
        await this.mutex.runExclusive(async () => {
            const command = this.getInstallCommand();
            debugLogger.debug("Running command: " + command);

            await exec(command);
        })
    }

    getInstallPackageCommand(noSave?: boolean): string {
        const dependencyManager = process.env.GENEZIO_DEPENDENCY_MANAGER || "npm";

        switch (dependencyManager) {
            case "npm":
                return "npm install " + (noSave ? "--no-save " : "");
            case "yarn":
                return "yarn add";
            case "pnpm":
                return "pnpm add";
            default:
                return "npm install";
        }
    }

    getInstallCommand(): string {
        const dependencyManager = process.env.GENEZIO_DEPENDENCY_MANAGER || "npm";

        switch (dependencyManager) {
            case "npm":
                return "npm install";
            case "yarn":
                return "yarn install";
            case "pnpm":
                return "pnpm install";
            default:
                return "npm install";
        }
    }
}

export { DependencyInstaller };