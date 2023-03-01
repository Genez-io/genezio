#! /usr/bin/env node

import { Command, CommanderError } from "commander";
import {
  deleteProjectHandler,
  init,
  addNewClass,
  deployClasses,
  reportSuccess,
  handleLogin,
  lsHandler,
  deployFrontend,
  generateSdkHandler,
} from "./commands";
import { setDebuggingLoggerLogLevel, spinner } from "./utils/logging";
import { asciiCapybara, GENEZIO_NOT_AUTH_ERROR_MSG } from "./utils/strings";
import { exit } from "process";
import { AxiosError } from "axios";
import {
  PORT_LOCAL_ENVIRONMENT,
  ENABLE_DEBUG_LOGS_BY_DEFAULT,
  LOCAL_TEST_INTERFACE_URL
} from "./variables";
import {
  listenForChanges,
  prepareForLocalEnvironment,
  startLocalTesting,
  startServer
} from "./localEnvironment";
import { getProjectConfiguration } from "./utils/configuration";
import log from "loglevel";
import { getAuthToken, removeAuthToken } from "./utils/accounts";

import { AstSummary } from "./models/astSummary";

import prefix from 'loglevel-plugin-prefix';
import generateSdkRequest from "./requests/generateSdk";
import { replaceUrlsInSdk, writeSdkToDisk } from "./utils/sdk";
import { LocalEnvCronHandler, LocalEnvStartServerOutput } from "./models/localEnvInputParams";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pjson = require("../package.json");

const program = new Command();

log.setDefaultLevel("INFO");
prefix.reg(log);
prefix.apply(log.getLogger("debuggingLogger"), {
  template: "[%t] %l:",
  levelFormatter(level) {
    return level.toUpperCase();
  },
  nameFormatter(name) {
    return name || "global";
  },
  timestampFormatter(date) {
    return date.toISOString();
  }
});

if (ENABLE_DEBUG_LOGS_BY_DEFAULT) {
  setDebuggingLoggerLogLevel("debug");
}

program
  .name("genezio")
  .usage("[command]")
  .description("CLI tool to interact with the genezio infrastructure!")
  .exitOverride((err: CommanderError) => {
    if (err.code === "commander.help" || err.code === "commander.version" || err.code === "commander.helpDisplayed") {
      exit(0);
    } else {
      console.log(`Type 'genezio --help' or 'genezio [command] --help'.`);
    }
  })
  .addHelpText("afterAll", `\nUse 'genezio [command] --help' for more information about a command.`)
  .version(pjson.version);

program
  .command("init")
  .option("--logLevel <logLevel>", "Show debug logs to console. Possible levels: trace/debug/info/warn/error.")
  .description("Create the initial configuration file for a genezio project.")
  .action(async (options: any) => {
    setDebuggingLoggerLogLevel(options.logLevel);
    try {
      await init();
    } catch (error: any) {
      log.error(error.message);
    }
  });

program
  .command("login")
  .argument("[accessToken]", "Personal access token.")
  .option("--logLevel <logLevel>", "Show debug logs to console. Possible levels: trace/debug/info/warn/error.")
  .description("Authenticate with genezio platform to deploy your code.")
  .action(async (accessToken = "", options: any) => {
    setDebuggingLoggerLogLevel(options.logLevel);
    log.info(asciiCapybara);

    await handleLogin(accessToken).catch((error: Error) => {
      log.error(error.message);
      exit(1);
    });
  });

program
  .command("deploy")
  .option("--frontend", "Deploy the frontend application.")
  .option("--logLevel <logLevel>", "Show debug logs to console. Possible levels: trace/debug/info/warn/error.")
  .description("Deploy your project to the genezio infrastructure. Use --frontend to deploy the frontend application.")
  .action(async (options: any) => {
    setDebuggingLoggerLogLevel(options.logLevel);

    // check if user is logged in
    const authToken = await getAuthToken();
    if (!authToken) {
      log.error(GENEZIO_NOT_AUTH_ERROR_MSG);
      exit(1);
    }

    if (options.frontend) {
      log.info("Deploying your frontend to genezio infrastructure...");
      let url;
      try {
        url = await deployFrontend()
      } catch(error: any) {
        log.error(error.message);
        exit(1);
      }
      log.info(
        "\x1b[36m%s\x1b[0m",
        `Frontend successfully deployed at ${url}.`);
      exit(0)
    }

    log.info("Deploying your backend project to genezio infrastructure...");
    await deployClasses()
      .catch((error: AxiosError) => {
        switch (error.response?.status) {
          case 401:
            log.error(GENEZIO_NOT_AUTH_ERROR_MSG);
            break;
          case 500:
            log.error(error.message);
            if (error.response?.data) {
              const data: any = error.response?.data;
              log.error(data.error?.message);
            }
            break;
          case 400:
            log.error(error.message);
            if (error.response?.data) {
              const data: any = error.response?.data;
              log.error(data.error?.message);
            }
            break;
          default:
            if (error.message) {
              log.error(error.message);
            }
            break;
        }
        exit(1);
      });
  });

program
  .command("addClass")
  .option("--logLevel <logLevel>", "Show debug logs to console. Possible levels: trace/debug/info/warn/error.")
  .argument("<classPath>", "Path of the class you want to add.")
  .argument(
    "[<classType>]",
    "The type of the class you want to add. [http, jsonrpc, cron]"
  )
  .description("Add a new class to the 'genezio.yaml' file.")
  .action(async (classPath: string, classType: string, options: any) => {
    setDebuggingLoggerLogLevel(options.logLevel);

    await addNewClass(classPath, classType).catch((error: Error) => {
      log.error(error.message);
      exit(1);
    });
  });

program
  .command("local")
  .option("--logLevel <logLevel>", "Show debug logs to console.")
  .option(
    "-p, --port <port>",
    "Set the port your local server will be running on.",
    String(PORT_LOCAL_ENVIRONMENT)
  )
  .description("Run a local environment for your functions.")
  .action(async (options: any) => {
    setDebuggingLoggerLogLevel(options.logLevel);

    const authToken = await getAuthToken();
    if (!authToken) {
      log.error(GENEZIO_NOT_AUTH_ERROR_MSG);
      exit(1);
    }

     let classesInfo: { className: any; methods: any; path: string; functionUrl: string; tmpFolder: string }[] = [];

    try {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const projectConfiguration = await getProjectConfiguration();

        let server: any = undefined;
        let handlers = undefined;
        let astSummary: AstSummary | undefined = undefined;
        let cronHandlers: LocalEnvCronHandler[] = [];
        await startLocalTesting(classesInfo, options)
          .catch(async (error: Error) => {
            if (error.message === "Unauthorized" || error.message.includes("401")) {
              log.error(GENEZIO_NOT_AUTH_ERROR_MSG);
              exit(1);
            }
            log.error("\x1b[31m%s\x1b[0m", `Error while preparing for local environment:\n${error.message}`);
            log.error(`Fix the errors and genezio local will restart automatically. Waiting for changes...`);

            await listenForChanges(null, null, null).catch(
              (error: Error) => {
                log.error(error.message);
                exit(1);
              }
            );
            return null;
          })
          .then(async (responseStartLocal: any) => {
            if (responseStartLocal === null) {
              return;
            }

            handlers = responseStartLocal.handlers;
            astSummary = responseStartLocal.astSummary;
            classesInfo = responseStartLocal.classesInfo;
            if (handlers != undefined) {
              log.info(
                "\x1b[32m%s\x1b[0m",
                `Test your code at ${LOCAL_TEST_INTERFACE_URL}?port=${options.port}`
              );
              const startServerOutput: LocalEnvStartServerOutput = await startServer(
                classesInfo,
                handlers,
                astSummary,
                Number(options.port)
              );

              server = startServerOutput.server;
              cronHandlers = startServerOutput.cronHandlers;


              server.on("error", (error: any) => {
                if (error.code === "EADDRINUSE") {
                  log.error(
                    `The port ${error.port} is already in use. Please use a different port by specifying --port <port> to start your local server.`
                  );
                } else {
                  log.error(error.message);
                }
                exit(1);
              });
            } else {
              log.info("\x1b[36m%s\x1b[0m", "Listening for changes...");
            }

            await listenForChanges(projectConfiguration.sdk.path, server, cronHandlers).catch(
              (error: Error) => {
                log.error(error.message);
                exit(1);
              }
            );
          })
      }
    } catch (error: any) {
      log.error(error.message);
      exit(1);
    }
  });

program
  .command("logout")
  .option("--logLevel <logLevel>", "Show debug logs to console. Possible levels: trace/debug/info/warn/error.")
  .description("Logout from Genezio platform.")
  .action(async (options: any) => {
    setDebuggingLoggerLogLevel(options.logLevel);
    await removeAuthToken()
      .then(() => {
        log.info("You are now logged out!");
      })
      .catch((error: any) => {
        if (error.code === "ENOENT") {
          log.error("You were already logged out.");
        } else {
          log.error("Logout failed!");
        }
        exit(1);
      });
  });

program
  .command("account")
  .option("--logLevel <logLevel>", "Show debug logs to console. Possible levels: trace/debug/info/warn/error.")
  .description("Display information about the current account.")
  .action(async (options: any) => {
    setDebuggingLoggerLogLevel(options.logLevel);

    const authToken = await getAuthToken();
    if (!authToken) {
      log.error(GENEZIO_NOT_AUTH_ERROR_MSG);
      exit(1)
    } else {
      log.info("You are logged in.");
    }
  });

program
  .command("ls")
  .argument("[identifier]", "Name or ID of the project you want to display.")
  .option("--logLevel <logLevel>", "Show debug logs to console. Possible levels: trace/debug/info/warn/error.")
  .option("-l, --long-listed", "List more details for each project")
  .description(
    "Display details of your projects. You can view them all at once or display a particular one by providing its name or ID."
  )
  .action(async (identifier = "", options: any) => {
    setDebuggingLoggerLogLevel(options.logLevel);

    // check if user is logged in
    const authToken = await getAuthToken();
    if (!authToken) {
      log.error(GENEZIO_NOT_AUTH_ERROR_MSG);
      exit(1);
    }

    await lsHandler(identifier, options.longListed).catch(
      (error: AxiosError) => {
        if (error.response?.status === 401) {
          log.error(GENEZIO_NOT_AUTH_ERROR_MSG);
        } else {
          log.error(error.message);
        }
        exit(1);
      }
    );
  });

program
  .command("delete")
  .argument("[projectId]", "ID of the project you want to delete.")
  .option("--logLevel <logLevel>", "Show debug logs to console. Possible levels: trace/debug/info/warn/error.")
  .option("-f, --force", "Skip confirmation prompt for deletion.", false)
  .description(
    "Delete the project described by the provided ID. If no ID is provided, lists all the projects and IDs."
  )
  .action(async (projectId = "", options: any) => {
    setDebuggingLoggerLogLevel(options.logLevel);

    // check if user is logged in
    const authToken = await getAuthToken();
    if (!authToken) {
      log.error(GENEZIO_NOT_AUTH_ERROR_MSG);
      exit(1);
    }

    const result = await deleteProjectHandler(projectId, options.force).catch(
      (error: AxiosError) => {
        if (error.response?.status == 401) {
          log.error(GENEZIO_NOT_AUTH_ERROR_MSG);
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

program
  .command("generateSdk")
  .option("--logLevel <logLevel>", "Show debug logs to console. Possible levels: trace/debug/info/warn/error.")
  .option("-lang, --language <language>", "Language of the SDK to generate.")
  .option("-p, --path <path>", "Path to the directory where the SDK will be generated.")
  .description("Generate an SDK for your project.")
  .action(async (options: any) => {
    setDebuggingLoggerLogLevel(options.logLevel);

    // check if user is logged in
    const authToken = await getAuthToken();
    if (!authToken) {
      log.error(GENEZIO_NOT_AUTH_ERROR_MSG);
      exit(1);
    }

    const language = options.language;
    const sdkPath = options.path;

    if (!language) {
      log.error("Please specify a language for the SDK to generate using --language <language>.");
      exit(1);
    }

    // check if language is supported
    if (language !== "ts" && language !== "js" && language !== "swift") {
      log.error("The language you specified is not supported. Please use one of the following: ts, js, swift.");
      exit(1);
    }

    if (!sdkPath) {
      log.error("Please specify a path for the SDK to generate using --path <path>.");
      exit(1);
    }

    await generateSdkHandler(language, sdkPath).catch((error: AxiosError) => {
      if (error.response?.status == 401) {
        log.error(GENEZIO_NOT_AUTH_ERROR_MSG);
      } else {
        log.error(error.message);
      }
      exit(1);
    });

    console.log("Your SDK has been generated successfully in " + sdkPath + "");
  });

program.parse();
