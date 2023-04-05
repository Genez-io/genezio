import jsonBody from "body/json";
import log from "loglevel";
import { AddressInfo } from "net";
import { exit } from "process";
import { REACT_APP_BASE_URL } from "../constants";
import { saveAuthToken } from "../utils/accounts";
import http from "http";
import open from "open";
import { asciiCapybara } from "../utils/strings";

export async function loginCommand(accessToken: string) {
  log.info(asciiCapybara);

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
      jsonBody(req, res, (err, body: any) => {
        const params = new URLSearchParams(req.url);

        const token = params.get("/?token")!;

        saveAuthToken(token).then(() => {
          log.info(`Welcome! You can now start using genezio.`);
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.setHeader("Access-Control-Allow-Headers", "Content-Type");
          res.setHeader("Access-Control-Allow-Methods", "POST");
          res.setHeader("Access-Control-Allow-Credentials", "true");
          res.writeHead(301, {
            Location: `${REACT_APP_BASE_URL}/cli/login/success`
          });
          res.end();

          exit(0);
        });
      });
    });

    const promise = new Promise((resolve) => {
      server.listen(0, "localhost", () => {
        log.info("Redirecting to browser to complete authentication...");
        const address = server.address() as AddressInfo;
        resolve(address.port);
      });
    });

    const port = await promise;
    const browserUrl = `${REACT_APP_BASE_URL}/cli/login?redirect_url=http://localhost:${port}/`;
    open(browserUrl);
  }
}