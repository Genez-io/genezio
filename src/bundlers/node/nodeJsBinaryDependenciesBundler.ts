import path from "path";
import fs from "fs";
import { BundlerInput, BundlerInterface, BundlerOutput, Dependency } from "../bundler.interface.js";
import { CloudProviderIdentifier } from "../../models/cloudProviderIdentifier.js";
import { fileExists } from "../../utils/file.js";
import { log } from "../../utils/logging.js";
import { debugLogger } from "../../utils/logging.js";
import { getPackageManager } from "../../packageManagers/packageManager.js";
import { UserError } from "../../errors.js";
import { $ } from "execa";

enum Architecture {
    ARM64 = "arm64",
    X64 = "x64",
}

export class NodeJsBinaryDependenciesBundler implements BundlerInterface {
    async #handleBinaryDependencies(
        dependenciesInfo: Dependency[],
        tempFolderPath: string,
        architecture: Architecture,
    ) {
        // create node_modules folder in tmp folder
        const nodeModulesPath = path.join(tempFolderPath, "node_modules");
        const binaryDependencies = [];

        if (!fs.existsSync(nodeModulesPath)) {
            fs.mkdirSync(nodeModulesPath, { recursive: true });
        }

        // copy all dependencies to node_modules folder
        for (const dependency of dependenciesInfo) {
            const dependencyPath = path.join(nodeModulesPath, dependency.name);

            // read package.json file
            if (dependency.name[0] === "@") {
                // Get List of all files in a directory
                const files = fs.readdirSync(dependencyPath);
                // iterate files and check if there is a package.json file
                for (const file of files) {
                    const packageJsonPath = path.join(dependencyPath, file, "package.json");
                    if (await fileExists(packageJsonPath)) {
                        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
                        if (packageJson.binary) {
                            binaryDependencies.push({
                                path: path.join(dependencyPath, file),
                                name: file,
                            });
                        }
                    }
                }
            } else {
                const packageJsonPath = path.join(dependencyPath, "package.json");
                if (await fileExists(packageJsonPath)) {
                    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

                    // check if package.json has binary property
                    if (packageJson.binary) {
                        binaryDependencies.push({
                            path: dependencyPath,
                            name: dependency.name,
                        });
                    }
                }
            }
        }

        if (binaryDependencies.length > 0) {
            await getPackageManager().install(
                ["node-addon-api", "@mapbox/node-pre-gyp"],
                tempFolderPath,
            );
        }

        for (const dependency of binaryDependencies) {
            try {
                const { stdout, stderr } = await $({
                    cwd: dependency.path,
                })`npx node-pre-gyp --update-binary --fallback-to-build --target_arch=${architecture} --target_platform=linux --target_libc=glibc clean install ${dependency.name}`;
                debugLogger.debug("[BinaryDepStdOut]", stdout);
                debugLogger.debug("[BinaryDepStdErr]", stderr);
            } catch (error) {
                debugLogger.debug("[BinaryDepStdOut]", error);
                log.error("An error has occurred while installing binary dependencies.");
                throw new UserError("An error has occurred while installing binary dependencies.");
            }
        }
    }

    async bundle(input: BundlerInput): Promise<BundlerOutput> {
        if (!input.extra.dependenciesInfo) {
            debugLogger.debug(
                `[NodeJSBinaryDependenciesBundler] No dependencies info for file ${input.path}... Something might be wrong.`,
            );
            return Promise.resolve(input);
        }

        debugLogger.debug(
            `[NodeJSBinaryDependenciesBundler] Redownload binary dependencies if necessary for file ${input.path}...`,
        );
        const architecture =
            input.projectConfiguration.cloudProvider == CloudProviderIdentifier.GENEZIO
                ? Architecture.ARM64
                : Architecture.X64;
        // 4. Redownload binary dependencies if necessary
        await this.#handleBinaryDependencies(
            input.extra.dependenciesInfo,
            input.path,
            architecture,
        );
        debugLogger.debug(
            `[NodeJSBinaryDependenciesBundler] Redownload binary dependencies done for file ${input.path}.`,
        );

        return Promise.resolve(input);
    }
}
