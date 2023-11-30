import { createRequire } from "module";
import path from "path";
import babel from "@babel/core";
import fs from "fs";

export default async function (filePath: string): Promise<string> {
    const fileData = fs.readFileSync(filePath, "utf8");
    const require = createRequire(import.meta.url);
    const packagePath = path.dirname(require.resolve("@babel/plugin-proposal-decorators"));
    const presetTypescript = path.dirname(require.resolve("@babel/preset-typescript"));

    const babelOutput = await babel.transformAsync(fileData, {
        presets: [presetTypescript],
        plugins: [[packagePath, { legacy: true }]],
        filename: filePath,
    });

    if (!babelOutput?.code) {
        throw new Error("Error while transforming decorators!");
    }

    return babelOutput.code;
}
