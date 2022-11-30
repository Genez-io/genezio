#! /usr/bin/env node

import { Command, CommanderError } from "commander";
import {
  deleteProjectHandler,
  generateSdks,
  init,
  addNewClass,
  deployClasses,
  reportSuccess,
  handleLogin
} from "./commands";
import { readToken } from "./utils/file";
import { setLogLevel } from "./utils/logging";
import { asciiCapybara } from "./utils/strings";

import keytar from "keytar";
import { exit } from "process";
import { AxiosError } from "axios";
import { PORT_LOCAL_ENVIRONMENT } from "./variables";
import {
  listenForChanges,
  prepareForLocalEnvironment,
  startServer
} from "./localEnvironment";
import { getProjectConfiguration } from "./utils/configuration";
import log from "loglevel";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pjson = require("../package.json");

const program = new Command();

log.setDefaultLevel("INFO");

program
  .name("genezio")
  .description("CLI to interact with the Genezio infrastructure!")
  .exitOverride((err: CommanderError) => {
    if (err.code === "commander.help") {
      exit(0);
    } else {
      console.log(`Type 'genezio --help'`);
    }
  })
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
  .argument("[accessToken]", "Personal access token.")
  .option("-v, --verbose", "Show debug logs to console.")
  .description("Authenticate with Genezio platform to deploy your code.")
  .action(async (accessToken = "", options: any) => {
    setLogLevel(options.verbose);
    log.info(asciiCapybara);

    await handleLogin(accessToken);
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
      console.log(error);
      if (error.response?.status == 401 || error.response?.status === 500) {
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

    await addNewClass(classPath, classType).catch((error: Error) => {
      log.error(error.message);
      exit(1);
    });
  });

program
  .command("local")
  .option("-v, --verbose", "Show debug logs to console.")
  .option(
    "-p, --port <port>",
    "Set the port your local server will be running on.",
    String(PORT_LOCAL_ENVIRONMENT)
  )
  .description("Run a local environment for your functions.")
  .action(async (options: any) => {
    setLogLevel(options.verbose);

    const authToken = await readToken().catch(() => undefined);

    if (!authToken) {
      log.warn(
        "You are not logged in. Run 'genezio login' before you deploy your function."
      );
      exit(1);
    }

    try {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const projectConfiguration = await getProjectConfiguration();

        const { functionUrlForFilePath, classesInfo, handlers } =
          await prepareForLocalEnvironment(
            projectConfiguration,
            Number(options.port)
          );

        await generateSdks(functionUrlForFilePath).catch((error: Error) => {
          if (error.message === "Unauthorized") {
            log.error(
              "You are not logged in or your token is invalid. Please run `genezio login` before you deploy your function."
            );
          } else {
            log.error(`${error.stack}`);
          }
          exit(1);
        });

        reportSuccess(classesInfo, projectConfiguration);
        const server = await startServer(handlers, Number(options.port));
        const err = await new Promise((resolve, reject) => {
          server.on("listening", () => {
            console.log("Listening...");
            resolve(undefined);
          });
          server.on("error", (error: Error) => {
            server.close();
            reject(error);
          });
        });
        if (err) {
          throw err;
        }
        await listenForChanges(projectConfiguration.sdk.path, server);
      }
    } catch (error: any) {
      if (error.code === "EADDRINUSE") {
        log.error(
          `The port ${error.port} is already in use. Please use a different port to start your local server`
        );
      } else {
        log.error(`${error.message}`);
      }
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
      log.info("You are logged in.");
    }
  });

program
  .command("delete")
  .argument("[projectId]", "ID of the project you want to delete.")
  .argument("[-f]", "Skip confirmation prompt for deletion.")
  .description(
    "Delete the project described by the provided ID. If no ID is provided, lists all the projects and IDs."
  )
  .action(async (projectId = "", forced = false) => {
    // check if user is logged in
    const authToken = await readToken().catch(() => undefined);

    if (!authToken) {
      log.info(
        "You are not logged in. Run 'genezio login' before you delete your function."
      );
      exit(1);
    }

    const result = await deleteProjectHandler(projectId, forced).catch(
      (error: AxiosError) => {
        if (error.response?.status == 401) {
          log.info(
            "You are not logged in or your token is invalid. Please run `genezio login` before you delete your function."
          );
        } else {
          log.error(error.message);
        }
        exit(1);
      }
    );

    if (result) {
      log.info("Your project has been deleted");
    }
  });

program.parse();
