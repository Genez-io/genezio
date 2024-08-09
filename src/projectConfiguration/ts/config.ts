import esbuild from "esbuild";
import { existsSync } from "fs";
import path from "path";
import { UserError } from "../../errors.js";
import { createTemporaryFolder } from "../../utils/file.js";
import { debugLogger } from "../../utils/logging.js";
import { commonjs } from "@hyrious/esbuild-plugin-commonjs";
import { nodeExternalsPlugin } from "esbuild-node-externals";
import fs from "fs-extra";
// import { nodeExternalsPlugin } from "esbuild-node-externals";
// import * as fs from 'fs-extra';

export async function readGenezioConfigTs(configPath: string = "genezio.config.ts") {
    if (!existsSync(configPath)) {
        throw new UserError(`The config file ${configPath} does not exist`);
    }

    await import(await bundleGenezioConfigTs(configPath));

    // @ts-expect-error This global variable is set by the genezio.config.ts file
    return global._internalGenezioConfig || {};
}

async function bundleGenezioConfigTs(configPath: string): Promise<string> {
    const tempFolder = await createTemporaryFolder();
    const outfile = path.join(tempFolder, "genezio.config.mjs");

    const cwd = process.cwd();

    // Copy the node_modules directory to the tempFolder
    const nodeModulesSrc = path.join(cwd, 'node_modules');
    const nodeModulesDest = path.join(tempFolder, 'node_modules');
    debugLogger.debug(nodeModulesSrc)
    debugLogger.debug(nodeModulesDest)

    if (existsSync(nodeModulesSrc)) {
        await fs.copy(nodeModulesSrc, nodeModulesDest);
    }

    const packageJsonSrc = path.join(cwd, 'package.json');
    const packageJsonDest = path.join(tempFolder, 'package.json');
    debugLogger.debug(nodeModulesSrc)
    debugLogger.debug(nodeModulesDest)

    if (existsSync(packageJsonSrc)) {
        await fs.copy(packageJsonSrc, packageJsonDest);
    }


    let nodeExternalPlugin;
    if (existsSync(path.join(cwd, "package.json"))) {
        nodeExternalPlugin = nodeExternalsPlugin({
            packagePath: path.join(cwd, "package.json"),
        });
    } else {
        nodeExternalPlugin = nodeExternalsPlugin();
    }


    debugLogger.debug(`debug bundling ${configPath} to ${outfile}`);
    await esbuild.build({
        entryPoints: [configPath],
        bundle: true,
        format: "esm",
        platform: "node",
        outfile,
        plugins: [nodeExternalPlugin, commonjs()],
    });

    return outfile;
}
