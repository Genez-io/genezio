import jsonBody from "body/json.js";
import log from "loglevel";
import { AddressInfo } from "net";
import { REACT_APP_BASE_URL } from "../constants.js";
import { saveAuthToken } from "../utils/accounts.js";
import http from "http";
import open from "open";
import { asciiCapybara } from "../utils/strings.js";
import { GenezioTelemetry, TelemetryEventTypes } from "../telemetry/telemetry.js";
import colors from "colors";

export async function loginCommand(accessToken: string, logSuccesMessage = true) {
    log.info(asciiCapybara);

    await GenezioTelemetry.sendEvent({
        eventType: TelemetryEventTypes.GENEZIO_LOGIN,
    });

    const promiseHttpServer = new Promise((resolve) => {
        if (accessToken !== "") {
            saveAuthToken(accessToken);
        } else {
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
                        if (logSuccesMessage) {
                            loginSuccessMsg();
                        }
                        res.setHeader("Access-Control-Allow-Origin", "*");
                        res.setHeader("Access-Control-Allow-Headers", "Content-Type");
                        res.setHeader("Access-Control-Allow-Methods", "POST");
                        res.setHeader("Access-Control-Allow-Credentials", "true");
                        res.writeHead(301, {
                            Location: `${REACT_APP_BASE_URL}/cli/login/success`,
                        });
                        res.end();

                        resolve(true);
                    });
                });
            });

            server.listen(0, "localhost", () => {
                log.info("Redirecting to browser to complete authentication...");
                const address = server.address() as AddressInfo;
                const browserUrl = `${REACT_APP_BASE_URL}/cli/login?redirect_url=http://localhost:${address.port}/`;
                open(browserUrl);
            });
        }
    });
    await promiseHttpServer;
}

function loginSuccessMsg() {
    log.info(`Welcome! You can now start using genezio.`);

    // next steps message
    log.info(`\n${colors.bold(`${colors.green("Next steps to get started: ")}`)}`);
    log.info(
        `\n${colors.green(
            "1. Create a new project:",
        )} You can create a new project by running the command ${colors.cyan("genezio")}`,
    );
    log.info(
        `\n${colors.green(
            "2. Add a new class:",
        )} Once your project is created, you can add a new class by running the command ${colors.cyan(
            "genezio addClass [filename]",
        )}`,
    );
    log.info(
        `\n${colors.green(
            "3. Test your project locally:",
        )} Test your project locally by running the command ${colors.cyan("genezio local")}`,
    );
    log.info(
        `\n${colors.green(
            "4. Deploy your project:",
        )} When your project is ready, you can deploy it to the genezio infrastructure by running the command ${colors.cyan(
            "genezio deploy",
        )}`,
    );
    log.info(`\n${colors.green("5. Documentation:")} ${colors.magenta("https://docs.genez.io")}`);
}
