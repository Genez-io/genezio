import which from "which";
import os from "os";
import path from "path";
import { GENEZIO_DARTAOTRUNTIME_NOT_FOUND, GENEZIO_DART_NOT_FOUND } from "../errors.js";
import { SemanticVersion } from "../models/semanticVersion.js";
import { execSync } from "child_process";

export function getDartSdkVersion(): SemanticVersion | undefined {
    const output = execSync("dart --version").toString();
    const re =
        /([0-9]+)\.([0-9]+)\.([0-9]+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+)?/;
    const result = output.match(re);

    if (!result) {
        return undefined;
    }

    return new SemanticVersion(result[0]);
}

export async function checkIfDartIsInstalled(): Promise<boolean> {
    const version = getDartSdkVersion();

    try {
        await which("dartaotruntime");
    } catch (e) {
        throw new Error(GENEZIO_DARTAOTRUNTIME_NOT_FOUND);
    }

    if (version) {
        return true;
    }

    throw new Error(GENEZIO_DART_NOT_FOUND);
}

export function getDartAstGeneratorPath(dartSdkVersion: string): {
    directory: string;
    path: string;
} {
    return {
        directory: path.join(os.homedir(), ".dart_ast_generator"),
        path: path.join(
            os.homedir(),
            ".dart_ast_generator",
            `genezioDartAstGenerator_${dartSdkVersion}_v0.1.aot`,
        ),
    };
}
