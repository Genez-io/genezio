import { GenezioDeployOptions } from "../../models/commandOptions.js";
import { interruptLocalProcesses } from "../../utils/localInterrupt.js";
import { debugLogger } from "../../utils/logging.js";
import { genezioDeploy } from "./genezio.js";
import fs from "fs";
import { nextJsDeploy } from "./nextjs.js";
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
    }
}

enum DeployType {
    Classic,
    NextJS,
}

function decideDeployType(): DeployType {
    const cwd = process.cwd();

    // Check if next.config.js exists
    if (
        fs.existsSync(path.join(cwd, "next.config.js")) ||
        fs.existsSync(path.join(cwd, "next.config.mjs"))
    ) {
        return DeployType.NextJS;
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
