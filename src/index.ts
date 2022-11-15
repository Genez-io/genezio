#! /usr/bin/env node

import { Command } from "commander";
import {
  deleteProjectHandler,
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
import {
  setLogLevel,
} from "./utils/logging"
import { parse } from "yaml";
import open from "open";
import { asciiCapybara } from "./utils/strings";
import http from "http";
import jsonBody from "body/json";
import keytar from "keytar";
import { REACT_APP_BASE_URL } from "./variables";
import { exit } from "process";
import { AxiosError } from "axios";
import { AddressInfo } from "net";
import { ProjectConfiguration } from "./models/projectConfiguration";
import {
  listenForChanges,
  prepareForLocalEnvironment,
  startServer
} from "./localEnvironment";
import { getProjectConfiguration } from "./utils/configuration";
import log from 'loglevel';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pjson = require("../package.json");

const program = new Command();

log.setDefaultLevel("INFO");

program
  .name("genezio")
  .description("CLI to interact with the Genezio infrastructure!")
  .version(pjson.version);

program
  .command("init")
  .option("-v, --verbose", "Show debug logs to console.")
  .description("Initialize a Genezio project.")
  .action(async (options: any) => {
    setLogLevel(options.verbose);
    try {
      await init();
    } catch (error: any) {
      log.error(error.message);
    }
  });

program
  .command("login")
  .option("-v, --verbose", "Show debug logs to console.")
  .description("Authenticate with Genezio platform to deploy your code.")
  .action(async (options: any) => {
    setLogLevel(options.verbose)
    log.info(asciiCapybara);

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
              log.info(
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
            log.error(error);
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
  });

program
  .command("deploy")
  .option("-v, --verbose", "Show debug logs to console.")
  .description(
    "Deploy the functions mentioned in the genezio.yaml file to Genezio infrastructure."
  )
  .action(async (options: any) => {
    // check if user is logged in
    setLogLevel(options.verbose);
    const authToken = await readToken().catch(() => undefined);

    if (!authToken) {
      log.warn(
        "You are not logged in. Run 'genezio login' before you deploy your function."
      );
      exit(1);
    }

    log.info("Deploying your project to genez.io infrastructure...");
    await deployClasses().catch((error: AxiosError) => {
      if (error.response?.status == 401) {
        log.error(
          "You are not logged in or your token is invalid. Please run `genezio login` before you deploy your function."
        );
      } else {
        log.error(error.message);
      }
      exit(1);
    });
  });

program
  .command("addClass")
  .option("-v, --verbose", "Show debug logs to console.")
  .argument("<classPath>", "Path of the class you want to add.")
  .argument(
    "[<classType>]",
    "The tipe of the class you want to add. [http, jsonrpc]"
  )
  .description("Add a new class to the genezio.yaml file.")
  .action(async (classPath: string, classType: string, options: any) => {
    setLogLevel(options.verbose);
    try {
      addNewClass(classPath, classType);
    } catch (error: any) {
      log.error(error.message);
    }
  });

program
  .command("local")
  .option("-v, --verbose", "Show debug logs to console.")
  .description("Run a local environment for your functions.")
  .action(async (options: any) => {
    setLogLevel(options.verbose);
    try {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const projectConfiguration = await getProjectConfiguration()

        const { functionUrlForFilePath, classesInfo, handlers } =
          await prepareForLocalEnvironment(projectConfiguration);

        await generateSdks(functionUrlForFilePath).catch((error: Error) => {
          log.error(`${error.stack}`);
        });

        reportSuccess(classesInfo, projectConfiguration);

        const server = await startServer(handlers);
        await listenForChanges(projectConfiguration.sdk.path, server);
      }
    } catch (error) {
      log.error(`${error}`);
    }
  });

program
  .command("logout")
  .option("-v, --verbose", "Show debug logs to console.")
  .description("Logout from Genezio platform.")
  .action(async (options: any) => {
    setLogLevel(options.verbose);
    keytar
      .findCredentials("genez.io")
      .then(async (credentials) => {
        credentials.forEach(async (credential) => {
          await keytar.deletePassword("genez.io", credential.account);
        });
      })
      .then(() => {
        log.info("You are now logged out!");
      })
      .catch(() => {
        log.warn("Logout failed!");
      });
  });

program
  .command("account")
  .option("-v, --verbose", "Show debug logs to console.")
  .description("Display information about the current account.")
  .action(async (options: any) => {
    setLogLevel(options.verbose);
    const authToken = await readToken(true).catch(() => undefined);

    if (!authToken) {
      log.info(
        "You are not logged in. Run 'genezio login' before displaying account information."
      );
    } else {
      log.info("Logged in as: " + authToken);
    }
  });

program
  .command("delete")
  .argument("[classId]", "ID of the project you want to delete.")
  .argument("[-f]", "Skip confirmation prompt for deletion.")
  .description("Delete the project described by the provided ID. If no ID is provided, lists all the projects and IDs.")
  .action(async (classId  = "", forced  = false) => {
    // check if user is logged in
    const authToken = await readToken().catch(() => undefined);

    if (!authToken) {
      console.log(
        "You are not logged in. Run 'genezio login' before you deploy your function."
      );
      exit(1);
    }

    // if (!await checkYamlFileExists()) {
    //   return;
    // }
    // await validateYamlFile();

    const result = await deleteProjectHandler(classId, forced).catch((error: AxiosError) => {
      if (error.response?.status == 401) {
        console.log(
          "You are not logged in or your token is invalid. Please run `genezio login` before you deploy your function."
        );
      } else {
        console.error(error.message);
      }
      exit(1);
    });

    if (result) {
      console.log("Your project has been deleted");
    }
  });

program.parse();
