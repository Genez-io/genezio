import { BundlerInput, BundlerInterface, BundlerOutput } from "../bundler.interface.js";
import ts from "typescript";
import { log } from "../../utils/logging.js";
import fs from "fs";
import { tsconfig } from "../../utils/configs.js";
import path from "path";
import { writeToFile } from "../../utils/file.js";
import { debugLogger } from "../../utils/logging.js";

export class TypeCheckerBundler implements BundlerInterface {
    // Call this class only once
    static used = false;

    async #generateTsconfigJson(cwd: string) {
        if (fs.existsSync(path.join(cwd, "tsconfig.json"))) {
            return;
        } else {
            log.info("No tsconfig.json file found. We will create one...");
            tsconfig.compilerOptions.rootDir = ".";
            tsconfig.compilerOptions.outDir = path.join(".", "build");
            tsconfig.include = [path.join(".", "**/*")];
            await writeToFile(cwd, "tsconfig.json", JSON.stringify(tsconfig, null, 4));
        }
    }

    static logChangeDetection() {
        TypeCheckerBundler.used = false;
    }

    async bundle(input: BundlerInput): Promise<BundlerOutput> {
        if (TypeCheckerBundler.used) {
            return input;
        }
        TypeCheckerBundler.used = true;

        const cwd = input.projectConfiguration.workspace?.backend || process.cwd();

        await this.#generateTsconfigJson(cwd);

        const configPath = path.join(cwd, "tsconfig.json");

        const config = ts.getParsedCommandLineOfConfigFile(configPath, undefined, {
            ...ts.sys,
            onUnRecoverableConfigFileDiagnostic: () => {},
        });
        if (!config) {
            throw new Error("Failed to parse tsconfig.json");
        }

        const program = ts.createProgram({
            rootNames: config.fileNames,
            options: config.options,
        });

        debugLogger.debug("Typechecking Typescript files...");
        const diagnostics = ts.getPreEmitDiagnostics(program);

        if (diagnostics.length > 0) {
            diagnostics.forEach((diagnostic) => {
                if (diagnostic.category === ts.DiagnosticCategory.Error) {
                    // Format the diagnostic and write it to stderr
                    log.error(
                        ts.formatDiagnostic(diagnostic, {
                            getCanonicalFileName: (fileName) => fileName,
                            getCurrentDirectory: ts.sys.getCurrentDirectory,
                            getNewLine: () => ts.sys.newLine,
                        }),
                    );
                }
            });

            throw new Error("Typescript compilation failed.");
        }

        return input;
    }
}
