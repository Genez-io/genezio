import jsonBody from "body/json.js";
import { log } from "../utils/logging.js";
import { AddressInfo } from "net";
import { DASHBOARD_URL } from "../constants.js";
import { saveAuthToken } from "../utils/accounts.js";
import http from "http";
import open from "open";
import { asciiCapybara } from "../utils/strings.js";
import { GenezioTelemetry, TelemetryEventTypes } from "../telemetry/telemetry.js";
import { isCI } from "../utils/process.js";
import { UserError } from "../errors.js";

export async function loginCommand(accessToken: string, logSuccessMessage = true) {
    if (!isCI() && logSuccessMessage) log.info(asciiCapybara);

    await GenezioTelemetry.sendEvent({
        eventType: TelemetryEventTypes.GENEZIO_LOGIN,
    });

    const promiseHttpServer = new Promise((resolve, reject) => {
        if (accessToken !== "") {
            saveAuthToken(accessToken);
            if (logSuccessMessage) {
                loginSuccessMsg();
            }
        } else {
            // If we are in a CI environment, we don't open the browser because it will hang indefinitely
            if (isCI()) {
                reject(
                    new UserError(
                        "CI environment detected. Authentication must be done using `genezio login <token> or set a valid GENEZIO_TOKEN=<token>",
                    ),
                );
                return;
            }
            const server = http.createServer((req, res) => {
                res.setHeader("Access-Control-Allow-Origin", "*");
                res.setHeader("Access-Control-Allow-Headers", "Content-Type");
                res.setHeader("Access-Control-Allow-Methods", "POST");
                res.setHeader("Access-Control-Allow-Credentials", "true");
                if (req.method === "OPTIONS") {
                    res.end();
                    return;
                }
                jsonBody(req, res, () => {
                    const params = new URLSearchParams(req.url);

                    const token = params.get("/?token")!;

                    saveAuthToken(token).then(() => {
                        if (logSuccessMessage) {
                            loginSuccessMsg();
                        }
                        res.setHeader("Access-Control-Allow-Origin", "*");
                        res.setHeader("Access-Control-Allow-Headers", "Content-Type");
                        res.setHeader("Access-Control-Allow-Methods", "POST");
                        res.setHeader("Access-Control-Allow-Credentials", "true");
                        res.writeHead(301, {
                            Location: `${DASHBOARD_URL}/cli/login/success`,
                        });
                        res.end();

                        // We close the server and all connections after sending the update to the browser
                        server.closeAllConnections();
                        server.close();

                        resolve(true);
                    });
                });
            });

            server.listen(0, "localhost", () => {
                log.info("Redirecting to browser to complete authentication...");
                const address = server.address() as AddressInfo;
                const browserUrl = `${DASHBOARD_URL}/cli/login?redirect_url=http://localhost:${address.port}/`;
                open(browserUrl);
            });
        }
    });
    await promiseHttpServer;
}

function loginSuccessMsg() {
    log.info(`Welcome! You can now start using genezio.`);
}
