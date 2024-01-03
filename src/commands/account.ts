import { GENEZIO_NOT_AUTH_ERROR_MSG } from "../errors.js";
import getUser from "../requests/getUser.js";
import { getAuthToken } from "../utils/accounts.js";
import log from "loglevel";

export async function accountCommand() {
    const authToken = await getAuthToken();
    if (!authToken) {
        throw new Error(GENEZIO_NOT_AUTH_ERROR_MSG);
    }

    const user = await getUser(authToken);

    log.info(`You are logged in as ${user.email}.`);
    log.info(`Your current membership details:`);
    log.info(` * Plan: ${user.subscriptionPlan}${user.customSubscription ? " (custom)" : ""}`);
    log.info(` * Member since: ${user.memberSince}`);
    log.info(` * Max projects: ${user.subscriptionLimits.maxProjects}`);
    log.info(` * Execution timeout: ${user.subscriptionLimits.executionTime}`);
    log.info(` * Max concurrency: ${user.subscriptionLimits.maxConcurrency}`);
    log.info(` * Max collaborators: ${user.subscriptionLimits.maxCollaborators}`);
}
