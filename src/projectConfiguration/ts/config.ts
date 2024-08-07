import esbuild from "esbuild";
import { existsSync } from "fs";
import path from "path";
import { UserError } from "../../errors.js";
import { createTemporaryFolder } from "../../utils/file.js";

export async function readGenezioConfigTs(configPath: string = "genezio.config.ts") {
    if (!existsSync(configPath)) {
        throw new UserError(`The config file ${configPath} does not exist`);
    }

    await import(await bundleGenezioConfigTs(configPath));

    // @ts-expect-error This global variable is set by the genezio.config.ts file
    return global._internalGenezioConfig || {};
}

async function bundleGenezioConfigTs(configPath: string): Promise<string> {
    const outfile = path.join(await createTemporaryFolder(), "genezio.config.mjs");

    await esbuild.build({
        entryPoints: [configPath],
        bundle: true,
        format: "esm",
        platform: "node",
        outfile,
    });

    return outfile;
}
