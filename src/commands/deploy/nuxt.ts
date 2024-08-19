import { GenezioDeployOptions } from "../../models/commandOptions.js";
import { UserError } from "../../errors.js";
import { genezioDeploy } from "./genezio.js";
import { $ } from "execa";
export async function nuxtJsDeploy(options: GenezioDeployOptions) {
    await $({ stdio: "inherit" })`npx nuxi build --preset=aws_lambda`.catch(() => {
        throw new UserError("Failed to build the Nuxt.js project. Check the logs above.");
    });
    await genezioDeploy(options);
}
