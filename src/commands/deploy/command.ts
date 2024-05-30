import { GenezioDeployOptions } from "../../models/commandOptions.js";
import { interruptLocalProcesses } from "../../utils/localInterrupt.js";
import { genezioDeploy } from "./genezio.js";

export async function deployCommand(options: GenezioDeployOptions) {
    await interruptLocalProcesses();

    // TODO: Decide deploy path based on current cwd. Example: If folder contains next.config.js, choose Next.js deploy
    genezioDeploy(options);
}
