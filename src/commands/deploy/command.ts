import { GenezioDeployOptions } from "../../models/commandOptions.js";
import { interruptLocalProcesses } from "../../utils/localInterrupt.js";
import { debugLogger } from "../../utils/logging.js";
import { genezioDeploy } from "./genezio.js";
import { nitroJsDeploy } from "./nitrojs/deploy.js";
import fs from "fs";
import { nextJsDeploy } from "./nextjs/deploy.js";
import path from "path";

export async function deployCommand(options: GenezioDeployOptions) {
    await interruptLocalProcesses();

    switch (decideDeployType()) {
        case DeployType.Classic:
            debugLogger.debug("Deploying classic genezio app");
            await genezioDeploy(options);

            break;
        case DeployType.NextJS:
            debugLogger.debug("Deploying Next.js app");
            await nextJsDeploy(options);
            break;
        case DeployType.NitroJS:
            debugLogger.debug("Deploying Nitro.js app");
            await nitroJsDeploy(options);
            break;
    }
}

enum DeployType {
    Classic,
    NextJS,
    NitroJS,
}

function decideDeployType(): DeployType {
    const cwd = process.cwd();

    // Check if next.config.js exists
    if (
        fs.existsSync(path.join(cwd, "next.config.js")) ||
        fs.existsSync(path.join(cwd, "next.config.mjs")) ||
        fs.existsSync(path.join(cwd, "next.config.cjs")) ||
        fs.existsSync(path.join(cwd, "next.config.ts"))
    ) {
        return DeployType.NextJS;
    }

    // Check if nitro.config.js exists
    if (
        fs.existsSync(path.join(cwd, "nitro.config.js")) ||
        fs.existsSync(path.join(cwd, "nitro.config.mjs")) ||
        fs.existsSync(path.join(cwd, "nitro.config.cjs")) ||
        fs.existsSync(path.join(cwd, "nitro.config.ts"))
    ) {
        return DeployType.NitroJS;
    }

    // Check if "next" package is present in the project dependencies
    if (fs.existsSync(path.join(cwd, "package.json"))) {
        const packageJson = JSON.parse(fs.readFileSync(path.join(cwd, "package.json"), "utf-8"));
        if (packageJson.dependencies?.next) {
            return DeployType.NextJS;
        }
    }

    return DeployType.Classic;
}
