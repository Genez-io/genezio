import getUser from "../requests/getUser.js";
import log from "loglevel";
import { isLoggedIn } from "../utils/accounts.js";
import { debugLogger } from "../utils/logging.js";
import { loginCommand } from "./login.js";

export async function accountCommand() {
    if (!(await isLoggedIn())) {
        debugLogger.debug("No auth token found. Starting automatic authentication...");
        await loginCommand("", false);
    }

    const user = await getUser();

    log.info(`You are logged in as ${user.email}.`);
    log.info(`Your current membership details:`);
    log.info(` * Plan: ${user.subscriptionPlan}${user.customSubscription ? " (custom)" : ""}`);
    log.info(` * Member since: ${user.memberSince}`);
    log.info(` * Max projects: ${user.subscriptionLimits.maxProjects}`);
    log.info(` * Execution timeout: ${user.subscriptionLimits.executionTime}`);
    log.info(` * Max concurrency: ${user.subscriptionLimits.maxConcurrency}`);
    log.info(` * Max collaborators: ${user.subscriptionLimits.maxCollaborators}`);
}
