import { GenezioDeployOptions } from "../../models/commandOptions.js";
import { interruptLocalProcesses } from "../../utils/localInterrupt.js";
import { debugLogger } from "../../utils/logging.js";
import { genezioDeploy } from "./genezio.js";
import fs from "fs";
import { nextJsDeploy } from "./nextjs.js";

export async function deployCommand(options: GenezioDeployOptions) {
    await interruptLocalProcesses();
    // create archive of the project

    const configIOController = new YamlConfigurationIOController(options.config, {
        stage: options.stage,
    });
    const configuration = await configIOController.read();

    switch (decideDeployType()) {
        case DeployType.Classic:
            debugLogger.debug("Deploying classic genezio app");
            await genezioDeploy(options, configuration);

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
    if (fs.existsSync(`${cwd}/next.config.js`) || fs.existsSync(`${cwd}/next.config.mjs`))
        return DeployType.NextJS;

    return DeployType.Classic;
}
