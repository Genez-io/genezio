#! /usr/bin/env node

import { Command } from "commander";
import {
  generateSdks,
  init,
  addNewClass,
  deployClasses,
  reportSuccess
} from "./commands";
import {
  validateYamlFile,
  checkYamlFileExists,
  readUTF8File,
  readToken
} from "./utils/file";
import path from "path";
import { parse } from "yaml";
import open from "open";
import { asciiCapybara } from "./utils/strings";
import http from "http";
import jsonBody from "body/json";
import keytar from "keytar";
import { PORT_LOCAL_ENVIRONMENT, REACT_APP_BASE_URL } from "./variables";
import { exit } from "process";
import { AxiosError } from "axios";
import { AddressInfo } from "net";
import { ProjectConfiguration } from "./models/projectConfiguration";
import { NodeJsBundler } from "./bundlers/javascript/nodeJsBundler";
import { listenForChanges, startServer } from "./localEnvironment";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pjson = require("../package.json");

const program = new Command();

program
  .name("genezio")
  .description("CLI to interact with the Genezio infrastructure!")
  .version(pjson.version);

program
  .command("init")
  .description("Initialize a Genezio project.")
  .action(async () => {
    try {
      await init();
    } catch (error: any) {
      console.error(error.message);
    }
  });

program
  .command("login")
  .description("Authenticate with Genezio platform to deploy your code.")
  .action(async () => {
    console.log(asciiCapybara);

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
        const user = JSON.parse(params.get("user")!);
        const name = user.name || "genezio-username";

        // delete all existing tokens for service genez.io
        keytar
          .findCredentials("genez.io")
          .then(async (credentials) => {
            // delete all existing tokens for service genez.io before adding the new one
            for (const elem of credentials) {
              await keytar.deletePassword("genez.io", elem.account);
            }
          })
          .then(() => {
            // save new token
            keytar.setPassword("genez.io", name, token).then(() => {
              console.log(
                `Welcome, ${name}! You can now start using genez.io.`
              );
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
          })
          .catch((error) => {
            console.log(error);
          });
      });
    });

    const promise = new Promise((resolve) => {
      server.listen(0, "localhost", () => {
        console.log("Redirecting to browser to complete authentication...");
        const address = server.address() as AddressInfo;
        resolve(address.port);
      });
    });

    const port = await promise;
    const browserUrl = `${REACT_APP_BASE_URL}/cli/login?redirect_url=http://localhost:${port}/`;
    open(browserUrl);
  });

program
  .command("deploy")
  .description(
    "Deploy the functions mentioned in the genezio.yaml file to Genezio infrastructure."
  )
  .action(async () => {
    // start time in milliseconds
    const startTime = new Date().getTime();

    // check if user is logged in
    const authToken = await readToken().catch(() => undefined);

    if (!authToken) {
      console.log(
        "You are not logged in. Run 'genezio login' before you deploy your function."
      );
      exit(1);
    }

    if (!(await checkYamlFileExists())) {
      return;
    }
    await validateYamlFile();

    await deployClasses().catch((error: AxiosError) => {
      if (error.response?.status == 401) {
        console.log(
          "You are not logged in or your token is invalid. Please run `genezio login` before you deploy your function."
        );
      } else {
        console.error(error.message);
      }
      exit(1);
    });
  });

program
  .command("addClass")
  .argument("<classPath>", "Path of the class you want to add.")
  .argument(
    "[<classType>]",
    "The tipe of the class you want to add. [http, jsonrpc]"
  )
  .description("Add a new class to the genezio.yaml file.")
  .action(async (classPath: string, classType: string) => {
    try {
      addNewClass(classPath, classType);
    } catch (error: any) {
      console.error(error.message);
    }
  });

program
  .command("local")
  .description("Run a local environment for your functions.")
  .action(async () => {
    try {
      if (!(await checkYamlFileExists())) {
        return;
      }

      const configurationFileContentUTF8 = await readUTF8File("./genezio.yaml");
      const configurationFileContent = await parse(
        configurationFileContentUTF8
      );
      const projectConfiguration = await ProjectConfiguration.create(
        configurationFileContent
      );
      const functionUrlForFilePath: any = {};
      const handlers: any = {};
      const classesInfo = [];

      for (const element of projectConfiguration.classes) {
        switch (element.language) {
          case ".js": {
            const bundler = new NodeJsBundler();

            const output = await bundler.bundle({
              configuration: element,
              path: element.path
            });
            const className = output.extra?.className;
            const handlerPath = path.join(output.path, "index.js");
            const baseurl = `http://127.0.0.1:${PORT_LOCAL_ENVIRONMENT}/`;
            const functionUrl = `${baseurl}${className}`;
            functionUrlForFilePath[path.parse(element.path).name] = functionUrl;

            classesInfo.push({
              className: output.extra?.className,
              methodNames: output.extra?.methodNames,
              path: element.path,
              functionUrl: baseurl
            });

            handlers[className] = {
              path: handlerPath
            };
            break;
          }
          default: {
            console.error(
              `Unsupported language ${element.language}. Skipping class ${element.path}`
            );
          }
        }
      }

      await generateSdks(functionUrlForFilePath).catch((error: Error) => {
        console.error(`${error.stack}`);
      });

      reportSuccess(classesInfo, projectConfiguration);

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const server = await startServer(handlers);
        await listenForChanges(projectConfiguration.sdk.path, server);
      }
    } catch (error) {
      console.error(`${error}`);
    }
  });

program
  .command("logout")
  .description("Logout from Genezio platform.")
  .action(async () => {
    keytar
      .findCredentials("genez.io")
      .then(async (credentials) => {
        credentials.forEach(async (credential) => {
          await keytar.deletePassword("genez.io", credential.account);
        });
      })
      .then(() => {
        console.log("You are now logged out!");
      })
      .catch(() => {
        console.log("Logout failed!");
      });
  });

program
  .command("account")
  .description("Display information about the current account.")
  .action(async () => {
    const authToken = await readToken(true).catch(() => undefined);

    if (!authToken) {
      console.log(
        "You are not logged in. Run 'genezio login' before displaying account information."
      );
    } else {
      console.log("Logged in as: " + authToken);
    }
  });

program.parse();
