import jsonBody from "body/json.js";
import { log } from "../utils/logging.js";
import { AddressInfo } from "net";
import { DASHBOARD_URL } from "../constants.js";
import { saveAuthToken } from "../utils/accounts.js";
import http from "http";
import open from "open";
import { asciiCapybara } from "../utils/strings.js";
import { GenezioTelemetry, TelemetryEventTypes } from "../telemetry/telemetry.js";

export async function loginCommand(accessToken: string, logSuccessMessage = true) {
    if (logSuccessMessage) log.info(asciiCapybara);

    await GenezioTelemetry.sendEvent({
        eventType: TelemetryEventTypes.GENEZIO_LOGIN,
    });

    const promiseHttpServer = new Promise((resolve) => {
        if (accessToken !== "") {
            saveAuthToken(accessToken);
            if (logSuccessMessage) {
                loginSuccessMsg();
            }
        } else {
            // If we are in a CI environment, we don't open the browser because it will hang indefinitely
            if (process.env["CI"]) {
                log.error(
                    "CI environment detected. Cannot open browser for authentication. Use `genezio login <token>` instead.",
                );
                resolve(true);
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

    // next steps message
    // log.info(`\n${colors.bold(`${colors.green("Next steps to get started: ")}`)}`);
    // log.info(
    //     `\n${colors.green(
    //         "1. Create a new project:",
    //     )} You can create a new project by running the command ${colors.cyan("genezio")}`,
    // );
    // log.info(
    //     `\n${colors.green(
    //         "2. Add a new class:",
    //     )} Once your project is created, you can add a new class by running the command ${colors.cyan(
    //         "genezio addClass [filename]",
    //     )}`,
    // );
    // log.info(
    //     `\n${colors.green(
    //         "3. Test your project locally:",
    //     )} Test your project locally by running the command ${colors.cyan("genezio local")}`,
    // );
    // log.info(
    //     `\n${colors.green(
    //         "4. Deploy your project:",
    //     )} When your project is ready, you can deploy it to the genezio infrastructure by running the command ${colors.cyan(
    //         "genezio deploy",
    //     )}`,
    // );
    // log.info(`\n${colors.green("5. Documentation:")} ${colors.magenta("https://docs.genezio.com")}`);
}
