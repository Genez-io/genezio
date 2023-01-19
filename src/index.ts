#! /usr/bin/env node

import { Command, CommanderError } from "commander";
import {
  deleteProjectHandler,
  generateSdks,
  init,
  addNewClass,
  deployClasses,
  reportSuccess,
  handleLogin,
  lsHandler
} from "./commands";
import { setDebuggingLoggerLogLevel } from "./utils/logging";
import { asciiCapybara } from "./utils/strings";
import { exit } from "process";
import { AxiosError } from "axios";
import { PORT_LOCAL_ENVIRONMENT, ENABLE_DEBUG_LOGS_BY_DEFAULT } from "./variables";
import {
  listenForChanges,
  prepareForLocalEnvironment,
  startServer
} from "./localEnvironment";
import { getProjectConfiguration } from "./utils/configuration";
import log from "loglevel";
import { getAuthToken, removeAuthToken } from "./utils/accounts";
import { Spinner } from "cli-spinner";
import prefix from 'loglevel-plugin-prefix';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pjson = require("../package.json");

const program = new Command();

log.setDefaultLevel("INFO");
prefix.reg(log);
prefix.apply(log.getLogger('debuggingLogger'), {
  template: '[%t] %l:',
  levelFormatter(level) {
    return level.toUpperCase();
  },
  nameFormatter(name) {
    return name || 'global';
  },
  timestampFormatter(date) {
    return date.toISOString();
  },
});

if (ENABLE_DEBUG_LOGS_BY_DEFAULT) {
  setDebuggingLoggerLogLevel("debug")
}

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
  .option("-l, --logLevel <logLevel", "Show debug logs to console.")
  .description("Initialize a Genezio project.")
  .action(async (options: any) => {
    setDebuggingLoggerLogLevel(options.logLevel)
    try {
      await init();
    } catch (error: any) {
      log.error(error.message);
    }
  });

program
  .command("login")
  .argument("[accessToken]", "Personal access token.")
  .option("-l, --logLevel <logLevel", "Show debug logs to console.")
  .description("Authenticate with Genezio platform to deploy your code.")
  .action(async (accessToken = "", options: any) => {
    setDebuggingLoggerLogLevel(options.logLevel)
    log.info(asciiCapybara);

    await handleLogin(accessToken);
  });

program
  .command("deploy")
  .option("-l, --logLevel <logLevel", "Show debug logs to console.")
  .description(
    "Deploy the functions mentioned in the genezio.yaml file to Genezio infrastructure."
  )
  .action(async (options: any) => {
    // check if user is logged in
    setDebuggingLoggerLogLevel(options.logLevel)
    const authToken = await getAuthToken();

    if (!authToken) {
      log.warn(
        "You are not logged in. Run 'genezio login' before you deploy your function."
      );
      exit(1);
    }

    const spinner = new Spinner("%s  ");
    spinner.setSpinnerString("|/-\\");
    spinner.start();

    log.info("Deploying your project to genezio infrastructure...");
    await deployClasses()
      .then(() => {
        spinner.stop(true);
      })
      .catch((error: AxiosError) => {
        if (error.response?.status === 401) {
          log.error(
            "You are not logged in or your token is invalid. Please run `genezio login` before you deploy your function."
          );
        } else if (error.response?.status === 500) {
          log.error(error.message);
          if (error.response?.data) {
            const data: any = error.response?.data;
            log.error(data.error?.message);
          }
        } else if (error.response?.status === 400) {
          log.error(error.message);
          if (error.response?.data) {
            const data: any = error.response?.data;
            log.error(data.error?.message);
          }
        } else {
          if (error.message) {
            log.error(error.message);
          }
        }
        exit(1);
      });
  });

program
  .command("addClass")
  .option("-l, --logLevel <logLevel", "Show debug logs to console.")
  .argument("<classPath>", "Path of the class you want to add.")
  .argument(
    "[<classType>]",
    "The tipe of the class you want to add. [http, jsonrpc]"
  )
  .description("Add a new class to the genezio.yaml file.")
  .action(async (classPath: string, classType: string, options: any) => {
    setDebuggingLoggerLogLevel(options.logLevel)

    await addNewClass(classPath, classType).catch((error: Error) => {
      log.error(error.message);
      exit(1);
    });
  });

program
  .command("local")
  .option("-l, --logLevel <logLevel", "Show debug logs to console.")
  .option(
    "-p, --port <port>",
    "Set the port your local server will be running on.",
    String(PORT_LOCAL_ENVIRONMENT)
  )
  .description("Run a local environment for your functions.")
  .action(async (options: any) => {
    setDebuggingLoggerLogLevel(options.logLevel)

    const authToken = await getAuthToken();

    if (!authToken) {
      log.warn(
        "You are not logged in. Run 'genezio login' before you deploy your function."
      );
      exit(1);
    }

    const spinner = new Spinner("%s  ");
    spinner.setSpinnerString("|/-\\");
    spinner.start();

    try {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const projectConfiguration = await getProjectConfiguration();

        let server: any = undefined;
        let functionUrlForFilePath = undefined;
        let classesInfo = undefined;
        let handlers = undefined;
        try {
          const localEnvInfo = await prepareForLocalEnvironment(
            projectConfiguration,
            Number(options.port)
          );

          functionUrlForFilePath = localEnvInfo.functionUrlForFilePath;
          classesInfo = localEnvInfo.classesInfo;
          handlers = localEnvInfo.handlers;
          if (Object.keys(functionUrlForFilePath).length > 0) {
            await generateSdks(functionUrlForFilePath).catch((error: Error) => {
              if (error.message === "Unauthorized") {
                log.error(
                  "You are not logged in or your token is invalid. Please run `genezio login` before you deploy your function."
                );
              } else {
                log.error(`${error.stack}`);
                exit(1)
              }
            });

            reportSuccess(classesInfo, projectConfiguration);
          }
          // eslint-disable-next-line no-empty
        } catch (error: any) {
          if (error.message) {
            log.error(`${error.message}`);
          } else {
            log.error("An error occured while generating the SDK. Please try again!")
          }
          exit(1)
        }

        if (handlers != undefined) {
          server = await startServer(handlers, Number(options.port))
          server.on("error", (error: any) => {
            if (error.code === "EADDRINUSE") {
              log.error(
                `The port ${error.port} is already in use. Please use a different port by specifying --port <port> to start your local server.`
              );
            } else {
              log.error(`${error.message}`);
            }
            exit(1)
          });
          spinner.stop(true);
        } else {
          log.info("\x1b[36m%s\x1b[0m", "Listening for changes...");
        }

        await listenForChanges(projectConfiguration.sdk.path, server).catch((error: Error) => {
          log.error(`${error.message}`);
          exit(1)
        });
      }
    } catch (error: any) {
      log.error(`${error.message}`);
      exit(1);
    }
  });

program
  .command("logout")
  .option("-l, --logLevel <logLevel", "Show debug logs to console.")
  .description("Logout from Genezio platform.")
  .action(async (options: any) => {
    setDebuggingLoggerLogLevel(options.logLevel)
    await removeAuthToken()
      .then(() => {
        log.info("You are now logged out!");
      })
      .catch(() => {
        log.warn("Logout failed!");
      });
  });

program
  .command("account")
  .option("-l, --logLevel <logLevel>", "Show debug logs to console.")
  .description("Display information about the current account.")
  .action(async (options: any) => {
    setDebuggingLoggerLogLevel(options.logLevel)
    const authToken = await getAuthToken();

    if (!authToken) {
      log.info(
        "You are not logged in. Run 'genezio login' before displaying account information."
      );
    } else {
      log.info("You are logged in.");
    }
  });

program
  .command("ls")
  .argument("[identifier]", "Name or ID of the project you want to display.")
  .option("-l, --logLevel <logLevel>", "Show debug logs to console.")
  .option("-l, --long-listed", "List more details for each project")
  .description(
    "Display details of your projects. You can view them all at once or display a particular one by providing its name or ID."
  )
  .action(async (identifier = "", options: any) => {
    setDebuggingLoggerLogLevel(options.logLevel)
    // check if user is logged in
    const authToken = await getAuthToken();

    if (!authToken) {
      log.info(
        "You are not logged in. Run 'genezio login' before you delete your function."
      );
      exit(1);
    }

    await lsHandler(identifier, options.longListed).catch(
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
  })

program
  .command("delete")
  .argument("[projectId]", "ID of the project you want to delete.")
  .option("-l, --logLevel <logLevel>", "Show debug logs to console.")
  .option("-f, --force", "Skip confirmation prompt for deletion.", false)
  .description(
    "Delete the project described by the provided ID. If no ID is provided, lists all the projects and IDs."
  )
  .action(async (projectId = "", options: any) => {
    setDebuggingLoggerLogLevel(options.logLevel)
    // check if user is logged in
    const authToken = await getAuthToken();

    if (!authToken) {
      log.info(
        "You are not logged in. Run 'genezio login' before you delete your function."
      );
      exit(1);
    }

    const result = await deleteProjectHandler(projectId, options.force).catch(
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
