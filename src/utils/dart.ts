import { SemanticVersion } from "../models/semanticVersion";
import { execSync } from 'child_process';


export function getDartSdkVersion(output: string): SemanticVersion|undefined {
    const re = /([0-9]+)\.([0-9]+)\.([0-9]+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+)?/;
    const result = output.match(re);

    if (!result) {
        return undefined;
    }

    return new SemanticVersion(result[0]);
}

export function isDartInstalled(): boolean {
    const output = execSync("dart --version");
    const version = getDartSdkVersion(output.toString());

    if (version) {
        return true;
    }
    return false;
}