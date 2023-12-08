import { Command, CommanderError } from "commander";
import { setDebuggingLoggerLogLevel } from "./utils/logging.js";
import { exit } from "process";
import { PORT_LOCAL_ENVIRONMENT, ENABLE_DEBUG_LOGS_BY_DEFAULT } from "./constants.js";
import log from "loglevel";
import prefix from "loglevel-plugin-prefix";
// commands imports
import { accountCommand } from "./commands/account.js";
import { addClassCommand } from "./commands/addClass.js";
import { deleteCommand } from "./commands/delete.js";
import { deployCommand } from "./commands/deploy.js";
import { generateSdkCommand } from "./commands/generateSdk.js";
import { startLocalEnvironment } from "./commands/local.js";
import { loginCommand } from "./commands/login.js";
import { logoutCommand } from "./commands/logout.js";
import { lsCommand } from "./commands/list.js";
import {
    BaseOptions,
    GenezioDeleteOptions,
    GenezioDeployOptions,
    GenezioLinkOptions,
    GenezioListOptions,
    GenezioLocalOptions,
    GenezioSdkOptions,
    GenezioUnlinkOptions,
} from "./models/commandOptions.js";
import currentGenezioVersion, { logOutdatedVersion } from "./utils/version.js";
import { GenezioTelemetry, TelemetryEventTypes } from "./telemetry/telemetry.js";
import { genezioCommand } from "./commands/superGenezio.js";
import { linkCommand, unlinkCommand } from "./commands/link.js";
import { getProjectConfiguration } from "./utils/configuration.js";
import { setPackageManager } from "./packageManagers/packageManager.js";
import { PackageManagerType } from "./models/yamlProjectConfiguration.js";

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
    },
});

if (ENABLE_DEBUG_LOGS_BY_DEFAULT) {
    setDebuggingLoggerLogLevel("debug");
}

// setup package manager
try {
    const configuration = await getProjectConfiguration("./genezio.yaml", true);
    if (configuration.packageManager) {
        if (!Object.keys(PackageManagerType).includes(configuration.packageManager)) {
            log.warn(
                `Unknown package manager '${configuration.packageManager}'. Using 'npm' instead.`,
            );
            throw new Error();
        }

        setPackageManager(configuration.packageManager);
    }
} catch (error) {
    setPackageManager(PackageManagerType.npm);
}

// super-genezio command
// commander is displaying help by default for calling `genezio` without a subcommand
// this is a workaround to avoid that
// Note: no options can be added to this command
if (process.argv.length === 2) {
    GenezioTelemetry.sendEvent({
        eventType: TelemetryEventTypes.GENEZIO_COMMAND,
    });
    process.env.CURRENT_COMMAND = "genezio";

    await genezioCommand().catch((error: Error) => {
        log.error(error.message);
        GenezioTelemetry.sendEvent({
            eventType: TelemetryEventTypes.GENEZIO_COMMAND_ERROR,
            errorTrace: error.message,
        });
        exit(1);
    });
    exit(0);
}

// make genezio --version
program.version(currentGenezioVersion, "-v, --version", "Output the current version of genezio.");

// program setup - used to display help and version
program
    .name("genezio")
    .usage("[command]")
    .description("CLI tool to interact with the genezio infrastructure!")
    .exitOverride((err: CommanderError) => {
        if (
            err.code === "commander.help" ||
            err.code === "commander.version" ||
            err.code === "commander.helpDisplayed"
        ) {
            exit(0);
        } else {
            log.info("");
            process.env.CURRENT_COMMAND = "help";
            program.outputHelp();
        }
    })
    .addHelpText(
        "afterAll",
        `\nUse 'genezio [command] --help' for more information about a command.`,
    );

// genezio login command
program
    .command("login")
    .argument("[accessToken]", "Personal access token.")
    .option(
        "--logLevel <logLevel>",
        "Show debug logs to console. Possible levels: trace/debug/info/warn/error.",
    )
    .description("Authenticate with genezio platform to deploy your code.")
    .action(async (accessToken = "", options: BaseOptions) => {
        setDebuggingLoggerLogLevel(options.logLevel);
        process.env.CURRENT_COMMAND = "login";
        await loginCommand(accessToken).catch((error: Error) => {
            log.error(error.message);
            GenezioTelemetry.sendEvent({
                eventType: TelemetryEventTypes.GENEZIO_LOGIN_ERROR,
                errorTrace: error.message,
            });
            exit(1);
        });

        await logOutdatedVersion();
        exit(0);
    });

// genezio deploy command
program
    .command("deploy")
    .option("--backend", "Deploy only the backend application.")
    .option("--frontend", "Deploy only the frontend application.")
    .option(
        "--logLevel <logLevel>",
        "Show debug logs to console. Possible levels: trace/debug/info/warn/error.",
    )
    .option("--install-deps", "Automatically install missing dependencies.", false)
    .option("--env <envFile>", "Load environment variables from a given file.", undefined)
    .option("--stage <stage>", "Stage to deploy to. Default: 'production'.")
    .option(
        "--subdomain <subdomain>",
        "Subdomain of your frontend deplyoment. If not set, the subdomain will be randomly generated.",
        undefined,
    )
    .description(
        `Deploy your project to the genezio infrastructure. Use --frontend to deploy only the frontend application.
Use --backend to deploy only the backend application.`,
    )
    .action(async (options: GenezioDeployOptions) => {
        setDebuggingLoggerLogLevel(options.logLevel);
        process.env.CURRENT_COMMAND = "deploy";
        await deployCommand(options);
        await logOutdatedVersion();
    });

// genezio addClass command
program
    .command("addClass")
    .option(
        "--logLevel <logLevel>",
        "Show debug logs to console. Possible levels: trace/debug/info/warn/error.",
    )
    .argument("<classPath>", "Path of the class you want to add.")
    .argument("[<classType>]", "The type of the class you want to add. [http, jsonrpc, cron]")
    .description("Add a new class to the 'genezio.yaml' file.")
    .action(async (classPath: string, classType: string, options: BaseOptions) => {
        setDebuggingLoggerLogLevel(options.logLevel);
        process.env.CURRENT_COMMAND = "addClass";
        await addClassCommand(classPath, classType).catch((error: Error) => {
            log.error(error.message);
            GenezioTelemetry.sendEvent({
                eventType: TelemetryEventTypes.GENEZIO_ADD_CLASS_ERROR,
                errorTrace: error.message,
            });
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
        String(PORT_LOCAL_ENVIRONMENT),
    )
    .option("--env <envFile>", "Load environment variables from a given .env file.", undefined)
    .option("--path <path>", "Path where to generate your local sdk.")
    .option("-l --language <language>", "Language of the generated sdk.")
    .option("--install-deps", "Automatically install missing dependencies.", false)
    .description("Run a local environment for your functions.")
    .action(async (options: GenezioLocalOptions) => {
        setDebuggingLoggerLogLevel(options.logLevel);
        process.env.CURRENT_COMMAND = "local";
        await startLocalEnvironment(options).catch((error) => {
            if (error.message) {
                log.error(error.message);
                GenezioTelemetry.sendEvent({
                    eventType: TelemetryEventTypes.GENEZIO_LOCAL_ERROR,
                    errorTrace: error.message,
                    commandOptions: JSON.stringify(options),
                });
            }
            exit(1);
        });
        await logOutdatedVersion();
    });

// genezio login command
program
    .command("logout")
    .option(
        "--logLevel <logLevel>",
        "Show debug logs to console. Possible levels: trace/debug/info/warn/error.",
    )
    .description("Logout from Genezio platform.")
    .action(async (options: BaseOptions) => {
        setDebuggingLoggerLogLevel(options.logLevel);
        process.env.CURRENT_COMMAND = "logout";
        await logoutCommand().catch((error) => {
            log.error(error.message);
            exit(1);
        });
        log.info("You are now logged out.");
        await logOutdatedVersion();
    });

// genezio account command
program
    .command("account")
    .option(
        "--logLevel <logLevel>",
        "Show debug logs to console. Possible levels: trace/debug/info/warn/error.",
    )
    .description("Display information about the current account.")
    .action(async (options: BaseOptions) => {
        setDebuggingLoggerLogLevel(options.logLevel);
        process.env.CURRENT_COMMAND = "account";
        await accountCommand().catch((error) => {
            log.error(error.message);
            exit(1);
        });

        log.info("You are logged in.");

        await logOutdatedVersion();
    });

// genezio ls command
program
    .command("ls")
    .argument("[identifier]", "Name or ID of the project you want to display.")
    .option(
        "--logLevel <logLevel>",
        "Show debug logs to console. Possible levels: trace/debug/info/warn/error.",
    )
    .option("-l, --long-listed", "List more details for each project", false)
    .description(
        "Display details of your projects. You can view them all at once or display a particular one by providing its name or ID.",
    )
    .action(async (identifier = "", options: GenezioListOptions) => {
        setDebuggingLoggerLogLevel(options.logLevel);

        process.env.CURRENT_COMMAND = "account";
        await lsCommand(identifier, options).catch((error) => {
            log.error(error.message);
            GenezioTelemetry.sendEvent({
                eventType: TelemetryEventTypes.GENEZIO_LS_ERROR,
                errorTrace: error.message,
                commandOptions: JSON.stringify(options),
            });
            exit(1);
        });

        await logOutdatedVersion();
    });

// genezio delete command
program
    .command("delete")
    .argument("[projectId]", "ID of the project you want to delete.")
    .option(
        "--logLevel <logLevel>",
        "Show debug logs to console. Possible levels: trace/debug/info/warn/error.",
    )
    .option("-f, --force", "Skip confirmation prompt for deletion.", false)
    .description(
        "Delete the project described by the provided ID. If no ID is provided, lists all the projects and IDs.",
    )
    .action(async (projectId = "", options: GenezioDeleteOptions) => {
        setDebuggingLoggerLogLevel(options.logLevel);

        process.env.CURRENT_COMMAND = "delete";
        await deleteCommand(projectId, options).catch((error) => {
            log.error(error.message);
            GenezioTelemetry.sendEvent({
                eventType: TelemetryEventTypes.GENEZIO_DELETE_PROJECT_ERROR,
                errorTrace: error.toString(),
            });
            exit(1);
        });

        await logOutdatedVersion();
    });

// genezio generateSdk command
program
    .command("sdk")
    .argument("[projectName]", "Name of the project you want to generate an SDK for.")
    .option(
        "--logLevel <logLevel>",
        "Show debug logs to console. Possible levels: trace/debug/info/warn/error.",
    )
    .option("--language <language>", "Language of the SDK.", "ts")
    .option(
        "-s, --source <source>",
        "Path to the genezio.yaml file on your disk. Used for loading project details from a genezio.yaml file, instead of command argumments like --name",
        "./",
    )
    .option("-p, --path <path>", "Path to the directory where the SDK will be generated.", "./sdk")
    .option("--stage <stage>", "Stage of the project.", "prod")
    .option("--region <region>", "Region where your project is deployed.", "us-east-1")
    .description(
        "Generate an SDK corresponding to a deployed or local project.\n\nProvide the project name to generate an SDK for a deployed project.\nEx: genezio sdk my-project --stage prod --region us-east-1\n\nProvide the path to the genezio.yaml on your disk to load project details (name and region) from that file instead of command arguments.\nEx: genezio sdk --source ../my-project",
    )
    .action(async (projectName = "", options: GenezioSdkOptions) => {
        setDebuggingLoggerLogLevel(options.logLevel);
        process.env.CURRENT_COMMAND = "sdk";
        await generateSdkCommand(projectName, options).catch((error) => {
            log.error(error.message);
            GenezioTelemetry.sendEvent({
                eventType: TelemetryEventTypes.GENEZIO_GENERATE_SDK_ERROR,
                errorTrace: error.message,
                commandOptions: JSON.stringify(options),
            });
            exit(1);
        });

        await logOutdatedVersion();
    });

program
    .command("link")
    .option(
        "--logLevel <logLevel>",
        "Show debug logs to console. Possible levels: trace/debug/info/warn/error.",
    )
    .option(
        "--projectName <projectName>",
        "The name of the project that you want to communicate with.",
    )
    .option("--region <region>", "The region of the project that you want to communicate with.")
    .description(
        "Set this path as the spot for your frontend app within a project that uses multiple repositories. Doing this helps 'genezio local' figure out by itself where to create the SDK.",
    )
    .action(async (options: GenezioLinkOptions) => {
        setDebuggingLoggerLogLevel(options.logLevel);
        process.env.CURRENT_COMMAND = "link";
        await linkCommand(options.projectName, options.region).catch((error) => {
            log.error(error.message);
            log.error(
                "Error: Command execution failed. Please ensure you are running this command from a directory containing 'genezio.yaml' or provide the '--projectName <name>' and '--region <region>' flags.",
            );
            exit(1);
        });
        log.info("Successfully linked the path to your genezio project.");

        await logOutdatedVersion();
    });

program
    .command("unlink")
    .option("--all", "Remove all links.", false)
    .option(
        "--projectName <projectName>",
        "The name of the project that you want to communicate with. If --all is used, this option is ignored.",
    )
    .option(
        "--region <region>",
        "The region of the project that you want to communicate with. If --all is used, this option is ignored.",
    )
    .description(
        "Clear the previously set path for your frontend app, which is useful when managing a project with multiple repositories. This reset allows 'genezio local' to stop automatically generating the SDK in that location.",
    )

    .action(async (options: GenezioUnlinkOptions) => {
        setDebuggingLoggerLogLevel(options.logLevel);
        process.env.CURRENT_COMMAND = "unlink";
        await unlinkCommand(options.all, options.projectName, options.region).catch((error) => {
            log.error(error.message);
            log.error(
                "Error: Command execution failed. Please ensure you are running this command from a directory containing 'genezio.yaml' or provide the '--projectName <name>' and '--region <region>' flags.",
            );
            exit(1);
        });
        if (options.all) {
            log.info("Successfully unlinked all paths to your genezio projects.");
            return;
        }
        log.info("Successfully unlinked the path to your genezio project.");

        await logOutdatedVersion();
    });
export default program;
