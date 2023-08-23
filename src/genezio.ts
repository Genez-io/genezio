import { Command, CommanderError } from "commander";
import { setDebuggingLoggerLogLevel } from "./utils/logging.js";
import { exit } from "process";
import {
  PORT_LOCAL_ENVIRONMENT,
  ENABLE_DEBUG_LOGS_BY_DEFAULT,
} from "./constants.js";
import log from "loglevel";
import prefix from 'loglevel-plugin-prefix';

// commands imports
import { accountCommand } from "./commands/account.js";
import { addClassCommand } from "./commands/addClass.js";
import { deleteCommand } from "./commands/delete.js";
import { deployCommand } from "./commands/deploy.js";
import { generateSdkCommand } from "./commands/generateSdk.js";
import { initCommand } from "./commands/init.js";
import { startLocalEnvironment } from "./commands/local.js";
import { loginCommand } from "./commands/login.js";
import { logoutCommand } from "./commands/logout.js";
import { lsCommand } from "./commands/ls.js";
import { GenezioDeployOptions, GenezioLocalOptions } from "./models/commandOptions.js";
import version, { logOutdatedVersion } from "./utils/version.js";
import { GenezioTelemetry } from "./telemetry/telemetry.js";

const program = new Command();


// logging setup
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

// program setup
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
  .version(version);

// genezio init command
program
  .command("init")
  .option("--logLevel <logLevel>", "Show debug logs to console. Possible levels: trace/debug/info/warn/error.")
  .description("Create the initial configuration file for a genezio project.")
  .action(async (options: any) => {
    setDebuggingLoggerLogLevel(options.logLevel);

    await initCommand().catch((error: Error) => {
      log.error(error.message);
      GenezioTelemetry.sendEvent({eventType: "GENEZIO_INIT_ERROR", errorTrace: error.message});
      exit(1);
    });
    await logOutdatedVersion();
  });

// genezio login command
program
  .command("login")
  .argument("[accessToken]", "Personal access token.")
  .option("--logLevel <logLevel>", "Show debug logs to console. Possible levels: trace/debug/info/warn/error.")
  .description("Authenticate with genezio platform to deploy your code.")
  .action(async (accessToken = "", options: any) => {
    setDebuggingLoggerLogLevel(options.logLevel);

    await loginCommand(accessToken).catch((error: Error) => {
      log.error(error.message);
      GenezioTelemetry.sendEvent({eventType: "GENEZIO_LOGIN_ERROR", errorTrace: error.message});
      exit(1);
    });
    await logOutdatedVersion();
  });

// genezio deploy command
program
  .command("deploy")
  .option("--backend", "Deploy only the backend application.")
  .option("--frontend", "Deploy only the frontend application.")
  .option("--logLevel <logLevel>", "Show debug logs to console. Possible levels: trace/debug/info/warn/error.")
  .option("--install-deps", "Automatically install missing dependencies.", false)
  .option("--stage <stage>", "Stage to deploy to. Default: 'production'.")
  .description(`Deploy your project to the genezio infrastructure. Use --frontend to deploy only the frontend application. 
Use --backend to deploy only the backend application.`)
  .action(async (options: GenezioDeployOptions) => {
    setDebuggingLoggerLogLevel(options.logLevel);

    await deployCommand(options);
    await logOutdatedVersion();
  });


// genezio addClass command
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

    await addClassCommand(classPath, classType).catch((error: Error) => {
      log.error(error.message);
      GenezioTelemetry.sendEvent({eventType: "GENEZIO_ADD_CLASS_ERROR", errorTrace: error.message});
      exit(1);
    });
    await logOutdatedVersion();
  });

// genezio local command
program
  .command("local")
  .option("--logLevel <logLevel>", "Show debug logs to console.")
  .option(
    "-p, --port <port>",
    "Set the port your local server will be running on.",
    String(PORT_LOCAL_ENVIRONMENT)
  )
  .option(
    "--env <envFile>",
    "Set a custom environment variables file.",
    undefined
  )
  .option("--install-deps", "Automatically install missing dependencies.", false)
  .description("Run a local environment for your functions.")
  .action(async (options: GenezioLocalOptions) => {
    setDebuggingLoggerLogLevel(options.logLevel);

    await startLocalEnvironment(options).catch((error: any) => {
      if (error.message) {
        log.error(error.message);
        GenezioTelemetry.sendEvent({eventType: "GENEZIO_LOCAL_ERROR", errorTrace: error.message});
      }
      exit(1);
    });
    await logOutdatedVersion();
  });

// genezio login command
program
  .command("logout")
  .option("--logLevel <logLevel>", "Show debug logs to console. Possible levels: trace/debug/info/warn/error.")
  .description("Logout from Genezio platform.")
  .action(async (options: any) => {
    setDebuggingLoggerLogLevel(options.logLevel);

    await logoutCommand();
    await logOutdatedVersion();
  });

// genezio account command
program
  .command("account")
  .option("--logLevel <logLevel>", "Show debug logs to console. Possible levels: trace/debug/info/warn/error.")
  .description("Display information about the current account.")
  .action(async (options: any) => {
    setDebuggingLoggerLogLevel(options.logLevel);

    await accountCommand();
    await logOutdatedVersion();
  });

// genezio ls command
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

    await lsCommand(identifier, options);
    await logOutdatedVersion();
  });


// genezio delete command
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

    await deleteCommand(projectId, options);
    await logOutdatedVersion();
  });

// genezio generateSdk command
program
  .command("sdk")
  .argument("[projectName]", "Name of the project you want to generate an SDK for.")
  .option("--logLevel <logLevel>", "Show debug logs to console. Possible levels: trace/debug/info/warn/error.")
  .option("-lang, --language <language>", "Language of the SDK to generate. Default: 'ts'.", "ts")
  .option("-s, --source <source>", "Path to the genezio.yaml file on your disk. Only used for generating SDKs for local projects. Default: './'.", "./")
  .option("-p, --path <path>", "Path to the directory where the SDK will be generated. Default: './sdk'.", "./sdk")
  .option("--port <port>", "Port of the local environment to generate the SDK for. Default: 8083.", "8083")
  .option("--stage <stage>", "Stage to deploy to. Default: 'prod'.", "prod")
  .option("--region <region>", "Region to deploy to. Default: 'us-east-1'.", "us-east-1")
  .description("Generate an SDK corresponding to a deployed or local project. Provide the project name to generate an SDK for a deployed project. Provide the path to the genezio.yaml on your disk to generate an SDK for a local project.")
  .action(async (projectName = "", options: any) => {
    setDebuggingLoggerLogLevel(options.logLevel);

    await generateSdkCommand(projectName, options).catch((error: Error) => {
      log.error(error.message);
      GenezioTelemetry.sendEvent({eventType: "GENEZIO_GENERATE_SDK_ERROR", errorTrace: error.message});
      exit(1);
    });
    await logOutdatedVersion();
  });

export default program;
