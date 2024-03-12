import fs from "fs";
import semver from "semver";
import { debugLogger } from "./logging.js";
import path from "path";
import { UserError } from "../errors.js";

/**
 * Reads the package.json file from a given path and checks if the version
 * of a specified dependency is comptabile with a given version.
 *
 * @param path - The path to the package.json file.
 * @param dependency - The name of the dependency to check.
 * @param version - The version to compare against.
 * @returns True if the dependency version is above or equal to the given version, false otherwise. Undefined if the dependency is not found.
 */
export function isDependencyVersionCompatible(
    path: string,
    dependency: string,
    version: string,
): boolean | undefined {
    try {
        const packageJson = JSON.parse(fs.readFileSync(path, "utf8"));

        const depVersion =
            packageJson.dependencies[dependency] || packageJson.devDependencies[dependency];
        if (!depVersion) {
            debugLogger.error(`Dependency ${dependency} not found.`);
            return undefined;
        }

        const minDependencyVersion = semver.minVersion(depVersion);
        return semver.satisfies(minDependencyVersion!, version);
    } catch (error) {
        debugLogger.error(`Error while reading package.json file: ${error}`);
        return undefined;
    }
}

/**
 * Check if the experimentalDecorators option is enabled in the tsconfig.json file.
 * @param backendPath - The path to the backend folder.
 * @returns void
 * @throws Error if the experimentalDecorators option is enabled.
 */
export function checkExperimentalDecorators(backendPath: string) {
    const tsconfigPath = path.join(backendPath, "tsconfig.json");
    let tsconfig;
    try {
        tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, "utf8"));
    } catch {
        // ignore error
    }
    if (tsconfig?.compilerOptions?.experimentalDecorators === true) {
        throw new UserError(
            `The experimentalDecorators option is enabled in your ${tsconfigPath} file. Please disable it to use genezio decorators.`,
        );
    }
}
