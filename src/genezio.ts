import { Command, CommanderError } from "commander";
import { code, setDebuggingLoggerLogLevel } from "./utils/logging.js";
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
import colors from "colors";

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
    await GenezioTelemetry.sendEvent({
        eventType: TelemetryEventTypes.GENEZIO_COMMAND,
    });
    process.env["CURRENT_COMMAND"] = "genezio";

    await genezioCommand().catch(async (error: Error) => {
        log.error(error.message);
        await GenezioTelemetry.sendEvent({
            eventType: TelemetryEventTypes.GENEZIO_COMMAND_ERROR,
            errorTrace: error.message,
        });
        exit(1);
    });
    exit(0);
}

// make genezio --version
program.version(currentGenezioVersion, "-v, --version", "Print the installed genezio version.");
program.helpOption("-h, --help", "Print this help message.");
program.addHelpCommand("help", "Print this help message.");
program.configureHelp({
    subcommandTerm: (cmd) => cmd.name(),
});

// program setup - used to display help and version
program
    .name("genezio")
    .usage("[-v | --version] [-h | --help] <command> [<options>]")
    .description(
        `${colors.green(
            "genezio v" + currentGenezioVersion,
        )} Build and deploy applications to the genezio infrastructure.`,
    )
    .exitOverride((err: CommanderError) => {
        if (
            err.code === "commander.help" ||
            err.code === "commander.version" ||
            err.code === "commander.helpDisplayed"
        ) {
            exit(0);
        } else {
            log.info("");
            process.env["CURRENT_COMMAND"] = "help";
            program.outputHelp();
        }
    })
    .addHelpText(
        "afterAll",
        `\nUse ${code("genezio [command] --help")} for more information about a command.`,
    );

program
    .command("deploy")
    .option(
        "--logLevel <logLevel>",
        "Show debug logs to console. Possible levels: trace/debug/info/warn/error.",
    )
    .option("--backend", "Deploy only the backend application.")
    .option("--frontend", "Deploy only the frontend application.")
    .option("--install-deps", "Automatically install missing dependencies", false)
    .option("--env <envFile>", "Load environment variables from a given file", undefined)
    .option("--stage <stage>", "Set the environment name to deploy to", "prod")
    .option(
        "--subdomain <subdomain>",
        "Set a subdomain for your frontend. If not set, the subdomain will be randomly generated.",
        undefined,
    )
    .summary("Deploy your project to the cloud.")
    .description(
        `Use --frontend to deploy only the frontend application.
Use --backend to deploy only the backend application.`,
    )
    .action(async (options: GenezioDeployOptions) => {
        setDebuggingLoggerLogLevel(options.logLevel);

        process.env["CURRENT_COMMAND"] = "deploy";
        await deployCommand(options).catch(async (error) => {
            log.error(error.message);
            await GenezioTelemetry.sendEvent({
                eventType: TelemetryEventTypes.GENEZIO_DEPLOY_ERROR,
                errorTrace: error.message,
                commandOptions: JSON.stringify(options),
            });
            exit(1);
        });

        await logOutdatedVersion();
    });

program
    .command("local")
    .option(
        "--logLevel <logLevel>",
        "Show debug logs to console. Possible levels: trace/debug/info/warn/error.",
    )
    .option(
        "-p, --port <port>",
        "Set the port your local server will be running on.",
        String(PORT_LOCAL_ENVIRONMENT),
    )
    .option("--env <envFile>", "Load environment variables from a given .env file.", undefined)
    .option("--path <path>", "Set the path where to generate your local sdk.")
    .option("-l | --language <language>", "Language of the generated sdk.")
    .option("--install-deps", "Automatically install missing dependencies.", false)
    .summary("Test a project in a local environment.")
    .action(async (options: GenezioLocalOptions) => {
        setDebuggingLoggerLogLevel(options.logLevel);

        process.env["CURRENT_COMMAND"] = "local";
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

program
    .command("addClass")
    .option(
        "--logLevel <logLevel>",
        "Show debug logs to console. Possible levels: trace/debug/info/warn/error.",
    )
    .argument("<classPath>", "Path of the class you want to add.")
    .argument("[<classType>]", "The type of the class you want to add. [http, jsonrpc, cron]")
    .summary("Add a new class to the configuration file.")
    .action(async (classPath: string, classType: string, options: BaseOptions) => {
        setDebuggingLoggerLogLevel(options.logLevel);
        process.env["CURRENT_COMMAND"] = "addClass";
        await addClassCommand(classPath, classType).catch(async (error: Error) => {
            log.error(error.message);
            await GenezioTelemetry.sendEvent({
                eventType: TelemetryEventTypes.GENEZIO_ADD_CLASS_ERROR,
                errorTrace: error.message,
            });
            exit(1);
        });

        await logOutdatedVersion();
    });

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
    .summary("Generate an SDK for a deployed or local project.")
    .description(
        "Generate an SDK corresponding to a deployed or local project.\n\nProvide the project name to generate an SDK for a deployed project.\nEx: genezio sdk my-project --stage prod --region us-east-1\n\nProvide the path to the genezio.yaml on your disk to load project details (name and region) from that file instead of command arguments.\nEx: genezio sdk --source ../my-project",
    )
    .action(async (projectName = "", options: GenezioSdkOptions) => {
        setDebuggingLoggerLogLevel(options.logLevel);
        process.env["CURRENT_COMMAND"] = "sdk";
        await generateSdkCommand(projectName, options).catch(async (error) => {
            log.error(error.message);
            await GenezioTelemetry.sendEvent({
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
    .summary("Links the genezio generated SDK in the current working directory")
    .description(
        "Linking a client with a deployed project will enable `genezio local` to figure out where to generate the SDK to call the backend methods.\n\
This command is useful when the project has dedicated repositories for the backend and the frontend.",
    )
    .action(async (options: GenezioLinkOptions) => {
        setDebuggingLoggerLogLevel(options.logLevel);
        process.env["CURRENT_COMMAND"] = "link";
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
    .option(
        "--logLevel <logLevel>",
        "Show debug logs to console. Possible levels: trace/debug/info/warn/error.",
    )
    .option("--all", "Remove all links.", false)
    .option(
        "--projectName <projectName>",
        "The name of the project that you want to communicate with. If --all is used, this option is ignored.",
    )
    .option(
        "--region <region>",
        "The region of the project that you want to communicate with. If --all is used, this option is ignored.",
    )
    .summary("Unlink the generated SDK from a client.")
    .description(
        "Clear the previously set path for your frontend app, which is useful when managing a project with multiple repositories.\n\
This reset allows 'genezio local' to stop automatically generating the SDK in that location.",
    )
    .action(async (options: GenezioUnlinkOptions) => {
        setDebuggingLoggerLogLevel(options.logLevel);
        process.env["CURRENT_COMMAND"] = "unlink";
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

program
    .command("list")
    .argument("[identifier]", "Name or ID of the project you want to display.")
    .option(
        "--logLevel <logLevel>",
        "Show debug logs to console. Possible levels: trace/debug/info/warn/error.",
    )
    .option("-l, --long-listed", "List more details for each project", false)
    .summary("List details about the deployed projects.")
    .description(
        "Display details of your projects. You can view them all at once or display a particular one by providing its name or ID.",
    )
    .action(async (identifier = "", options: GenezioListOptions) => {
        setDebuggingLoggerLogLevel(options.logLevel);
        process.env["CURRENT_COMMAND"] = "list";
        await lsCommand(identifier, options).catch(async (error) => {
            log.error(error.message);
            await GenezioTelemetry.sendEvent({
                eventType: TelemetryEventTypes.GENEZIO_LS_ERROR,
                errorTrace: error.message,
                commandOptions: JSON.stringify(options),
            });
            exit(1);
        });

        await logOutdatedVersion();
    });

program
    .command("delete")
    .argument("[projectId]", "ID of the project you want to delete.")
    .option(
        "--logLevel <logLevel>",
        "Show debug logs to console. Possible levels: trace/debug/info/warn/error.",
    )
    .option("-f, --force", "Skip confirmation prompt for deletion.", false)
    .summary("Delete a deployed project.")
    .description(
        "Delete the project described by the provided ID. If no ID is provided, lists all the projects and IDs.",
    )
    .action(async (projectId = "", options: GenezioDeleteOptions) => {
        setDebuggingLoggerLogLevel(options.logLevel);

        process.env["CURRENT_COMMAND"] = "delete";
        await deleteCommand(projectId, options).catch(async (error) => {
            log.error(error.message);
            await GenezioTelemetry.sendEvent({
                eventType: TelemetryEventTypes.GENEZIO_DELETE_PROJECT_ERROR,
                errorTrace: error.toString(),
            });
            exit(1);
        });

        await logOutdatedVersion();
    });

program
    .command("login")
    .argument("[accessToken]", "Set an access token to login with.")
    .option(
        "--logLevel <logLevel>",
        "Show debug logs to console. Possible levels: trace/debug/info/warn/error.",
    )
    .summary("Login to the genezio platform.")
    .action(async (accessToken = "", options: BaseOptions) => {
        setDebuggingLoggerLogLevel(options.logLevel);
        process.env["CURRENT_COMMAND"] = "login";
        await loginCommand(accessToken).catch(async (error) => {
            log.error(error.message);
            await GenezioTelemetry.sendEvent({
                eventType: TelemetryEventTypes.GENEZIO_LOGIN_ERROR,
                errorTrace: error.message,
            });
            exit(1);
        });

        await logOutdatedVersion();
        exit(0);
    });

program
    .command("logout")
    .option(
        "--logLevel <logLevel>",
        "Show debug logs to console. Possible levels: trace/debug/info/warn/error.",
    )
    .summary("Logout from the genezio platform.")
    .action(async (options: BaseOptions) => {
        setDebuggingLoggerLogLevel(options.logLevel);
        process.env["CURRENT_COMMAND"] = "logout";
        await logoutCommand().catch((error) => {
            log.error(error.message);
            exit(1);
        });
        log.info("You are now logged out.");
        await logOutdatedVersion();
    });

program
    .command("account")
    .option(
        "--logLevel <logLevel>",
        "Show debug logs to console. Possible levels: trace/debug/info/warn/error.",
    )
    .summary("Display information about the current account.")
    .action(async (options: BaseOptions) => {
        setDebuggingLoggerLogLevel(options.logLevel);
        process.env["CURRENT_COMMAND"] = "account";

        await accountCommand().catch((error) => {
            log.error(error.message);
            exit(1);
        });

        log.info("You are logged in.");
        await logOutdatedVersion();
    });
export default program;
