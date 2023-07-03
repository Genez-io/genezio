import log from "loglevel";
import { exit } from "process";
import { GENEZIO_NOT_AUTH_ERROR_MSG } from "../errors.js";
import { getAuthToken } from "../utils/accounts.js";

export async function accountCommand() {
  const authToken = await getAuthToken();
  if (!authToken) {
    log.error(GENEZIO_NOT_AUTH_ERROR_MSG);
    exit(1)
  } else {
    log.info("You are logged in.");
  }
}