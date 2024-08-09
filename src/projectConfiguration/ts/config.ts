import esbuild from "esbuild";
import { existsSync } from "fs";
import path from "path";
import { UserError } from "../../errors.js";
import { commonjs } from "@hyrious/esbuild-plugin-commonjs";
import { nodeExternalsPlugin } from "esbuild-node-externals";
import fs from "fs-extra";

export async function readGenezioConfigTs(configPath: string = "genezio.config.ts") {
    if (!existsSync(configPath)) {
        throw new UserError(`The config file ${configPath} does not exist`);
    }

    await import(await bundleGenezioConfigTs(configPath));

    // @ts-expect-error This global variable is set by the genezio.config.ts file
    return global._internalGenezioConfig || {};
}

async function bundleGenezioConfigTs(configPath: string): Promise<string> {
    const cwd = process.cwd();
    const workingDirectory = path.join(cwd, ".genezio");

    // Create a .genezio directory if it doen't exist
    if (!existsSync(workingDirectory)) {
        fs.mkdirSync(workingDirectory);
    }

    const outfile = path.join(workingDirectory, "genezio.config.js");

    let nodeExternalPlugin;
    if (existsSync(path.join(cwd, "package.json"))) {
        nodeExternalPlugin = nodeExternalsPlugin({
            packagePath: path.join(cwd, "package.json"),
        });
    } else {
        nodeExternalPlugin = nodeExternalsPlugin();
    }

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
