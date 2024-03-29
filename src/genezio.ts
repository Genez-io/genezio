import { Command, CommanderError, Option } from "commander";
import { code, debugLogger, logError, setDebuggingLoggerLogLevel } from "./utils/logging.js";
import { exit } from "process";
import { PORT_LOCAL_ENVIRONMENT, ENABLE_DEBUG_LOGS_BY_DEFAULT } from "./constants.js";
import { log } from "./utils/logging.js";
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
    GenezioBundleOptions,
    GenezioCreateBackendOptions,
    GenezioCreateFullstackOptions,
    GenezioCreateInteractiveOptions,
    GenezioDeleteOptions,
    GenezioDeployOptions,
    GenezioLinkOptions,
    GenezioListOptions,
    GenezioLocalOptions,
    GenezioSdkOptions,
    GenezioUnlinkOptions,
} from "./models/commandOptions.js";
import currentGenezioVersion, {
    checkNodeMinimumVersion,
    logOutdatedVersion,
} from "./utils/version.js";
import { GenezioTelemetry, TelemetryEventTypes } from "./telemetry/telemetry.js";
import { genezioCommand } from "./commands/superGenezio.js";
import { linkCommand, unlinkCommand } from "./commands/link.js";
import { PackageManagerType, setPackageManager } from "./packageManagers/packageManager.js";
import colors from "colors";
import { createCommand } from "./commands/create/create.js";
import { bundleCommand } from "./commands/bundle.js";
import { askCreateOptions } from "./commands/create/interactive.js";
import { regions } from "./utils/configs.js";
import { backendTemplates, frontendTemplates } from "./commands/create/templates.js";
import configReader from "./yamlProjectConfiguration/v2.js";

const program = new Command();

checkNodeMinimumVersion();

if (ENABLE_DEBUG_LOGS_BY_DEFAULT) {
    setDebuggingLoggerLogLevel("debug");
}

// setup package manager
try {
    const configuration = await configReader.read();
    // const configuration = await getProjectConfiguration("./genezio.yaml", true);
    const packageManager = configuration.backend?.language.packageManager;
    if (packageManager) {
        if (!Object.keys(PackageManagerType).includes(packageManager)) {
            log.warn(`Unknown package manager '${packageManager}'. Using 'npm' instead.`);
            throw new Error();
        }

        setPackageManager(packageManager);
    }
} catch {
    setPackageManager(PackageManagerType.npm);
} finally {
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

    await genezioCommand().catch(async (error: Error) => {
        logError(error);
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
program
    .addOption(
        new Option("--logLevel <log-level>", "Show debug logs to console.").choices([
            "trace",
            "debug",
            "info",
            "warn",
            "error",
            "disable",
        ]),
    )
    .hook("preAction", (thisCommand: Command) => {
        setDebuggingLoggerLogLevel(thisCommand.opts()["logLevel"]);
    });
program.hook("postAction", async () => {
    await logOutdatedVersion().catch((error) => {
        debugLogger.error("Could not log outdated version", error);
        exit(0);
    });
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
            program.outputHelp();
        }
    })
    .addHelpText(
        "afterAll",
        `\nUse ${code("genezio [command] --help")} for more information about a command.`,
    );

program
    .command("deploy")
    .option("--backend", "Deploy only the backend application.", false)
    .option("--frontend", "Deploy only the frontend application.", false)
    .option("--install-deps", "Automatically install missing dependencies", false)
    .option("--env <envFile>", "Load environment variables from a given file", undefined)
    .option("--stage <stage>", "Set the environment name to deploy to", "prod")
    .option(
        "--subdomain <subdomain>",
        "Set a subdomain for your frontend. If not set, the subdomain will be randomly generated.",
        undefined,
    )
    .option(
        "--config <config>",
        "Use a specific `genezio.yaml` file as deployment configuration",
        "./genezio.yaml",
    )
    .summary("Deploy your project to the cloud.")
    .description(
        `Use --frontend to deploy only the frontend application.
Use --backend to deploy only the backend application.`,
    )
    .action(async (options: GenezioDeployOptions) => {
        await deployCommand(options).catch(async (error: Error) => {
            logError(error);
            await GenezioTelemetry.sendEvent({
                eventType: TelemetryEventTypes.GENEZIO_DEPLOY_ERROR,
                errorTrace: error.message,
                commandOptions: JSON.stringify(options),
            });
            exit(1);
        });
    });

program
    .command("local")
    .option(
        "-p, --port <port>",
        "Set the port your local server will be running on.",
        String(PORT_LOCAL_ENVIRONMENT),
    )
    .option("--env <envFile>", "Load environment variables from a given .env file.", undefined)
    .option("--path <path>", "Set the path where to generate your local sdk.")
    .option("-l | --language <language>", "Language of the generated sdk.")
    .option("--install-deps", "Automatically install missing dependencies.", false)
    .option(
        "--config <config>",
        "Use a specific `genezio.yaml` file as deployment configuration",
        "./genezio.yaml",
    )
    .summary("Test a project in a local environment.")
    .action(async (options: GenezioLocalOptions) => {
        await startLocalEnvironment(options).catch(async (error) => {
            logError(error);
            await GenezioTelemetry.sendEvent({
                eventType: TelemetryEventTypes.GENEZIO_LOCAL_ERROR,
                errorTrace: error.message,
                commandOptions: JSON.stringify(options),
            });
            exit(1);
        });
    });

const create = program
    .command("create")
    .option("--path <path>", "Path where to create the project.", undefined)
    .summary("Create a new project from a template.")
    .action(async (options: GenezioCreateInteractiveOptions) => {
        const createOptions = await askCreateOptions(options);

        const telemetryEvent = GenezioTelemetry.sendEvent({
            eventType: TelemetryEventTypes.GENEZIO_CREATE,
            commandOptions: JSON.stringify(createOptions),
        });

        await createCommand(createOptions).catch(async (error) => {
            logError(error);
            await telemetryEvent;
            await GenezioTelemetry.sendEvent({
                eventType: TelemetryEventTypes.GENEZIO_CREATE_ERROR,
                errorTrace: error.message,
            });
            exit(1);
        });
        await telemetryEvent;
    });

create
    .command("fullstack")
    .option("--name <name>", "Name of the project.")
    .addOption(
        new Option("--region <region>", "Region of the project.").choices(
            regions.map((region) => region.value),
        ),
    )
    .addOption(
        new Option("--backend <backend>", "Backend template.").choices(
            Object.keys(backendTemplates),
        ),
    )
    .addOption(
        new Option("--frontend <frontend>", "Frontend template.").choices(
            Object.keys(frontendTemplates),
        ),
    )
    .option(
        "--multirepo",
        "Create a project with a backend and a frontend in separate repositories.",
        false,
    )
    .option("--path <path>", "Path where to create the project.", undefined)
    .summary("Create a new project from a backend and a frontend template.")
    .action(async (options: GenezioCreateFullstackOptions) => {
        const createOptions = await askCreateOptions({ ...options, type: "fullstack" });

        const telemetryEvent = GenezioTelemetry.sendEvent({
            eventType: TelemetryEventTypes.GENEZIO_CREATE,
            commandOptions: JSON.stringify(createOptions),
        });

        await createCommand(createOptions).catch(async (error) => {
            logError(error);
            await telemetryEvent;
            await GenezioTelemetry.sendEvent({
                eventType: TelemetryEventTypes.GENEZIO_CREATE_ERROR,
                errorTrace: error.message,
            });
            exit(1);
        });
        await telemetryEvent;
    });

create
    .command("backend")
    .option("--name <name>", "Name of the project.")
    .addOption(
        new Option("--region <region>", "Region of the project.").choices(
            regions.map((region) => region.value),
        ),
    )
    .addOption(
        new Option("--backend <backend>", "Backend template.").choices(
            Object.keys(backendTemplates),
        ),
    )
    .option("--path <path>", "Path where to create the project.", undefined)
    .summary("Create a new project from a backend template.")
    .action(async (options: GenezioCreateBackendOptions) => {
        const createOptions = await askCreateOptions({ ...options, type: "backend" });

        const telemetryEvent = GenezioTelemetry.sendEvent({
            eventType: TelemetryEventTypes.GENEZIO_CREATE,
            commandOptions: JSON.stringify(createOptions),
        });

        await createCommand(createOptions).catch(async (error) => {
            logError(error);
            await telemetryEvent;
            await GenezioTelemetry.sendEvent({
                eventType: TelemetryEventTypes.GENEZIO_CREATE_ERROR,
                errorTrace: error.message,
            });
            exit(1);
        });
        await telemetryEvent;
    });

program
    .command("addClass")
    .argument("<classPath>", "Path of the class you want to add.")
    .argument("[<classType>]", "The type of the class you want to add. [http, jsonrpc, cron]")
    .summary("Add a new genezio class to your project”")
    .action(async (classPath: string, classType: string) => {
        await addClassCommand(classPath, classType).catch(async (error: Error) => {
            logError(error);
            await GenezioTelemetry.sendEvent({
                eventType: TelemetryEventTypes.GENEZIO_ADD_CLASS_ERROR,
                errorTrace: error.message,
            });
            exit(1);
        });
    });

program
    .command("sdk")
    .argument("[projectName]", "Name of the project you want to generate an SDK for.")
    .option("--language <language>", "Language of the SDK.", "ts")
    .option("--packageName <packageName>", "The name of the package.")
    .option("--packageVersion <packageVersion>", "The version of the package.", "1.0.0")
    .addOption(
        new Option("--source <source>", "Where the SDK should be generated from.")
            .choices(["local", "remote"])
            .default("remote"),
    )
    .option(
        "-c, --config <config>",
        "Path to the genezio.yaml file on your disk. Used for loading project details from a genezio.yaml file, instead of command arguments like --name",
        "./",
    )
    .option(
        "-o, --output <output>",
        "Path to the directory where the SDK will be generated.",
        "./sdk",
    )
    .option("--stage <stage>", "Stage of the project.", "prod")
    .option("--url <url>", "The url of the server.")
    .option("--region <region>", "Region where your project is deployed.", "us-east-1")
    .summary("Generate an SDK for a deployed or local project.")
    .description(
        "Generate an SDK corresponding to a deployed or local project.\n\nProvide the project name to generate an SDK for a deployed project.\nEx: genezio sdk my-project --stage prod --region us-east-1\n\nProvide the path to the genezio.yaml on your disk to load project details (name and region) from that file instead of command arguments.\nEx: genezio sdk --source ../my-project",
    )
    .action(async (projectName = "", options: GenezioSdkOptions) => {
        if ((options.language === "ts" || options.language === "js") && !options.packageName) {
            log.error("The --packageName option is required for TypeScript and JavaScript SDKs.");
            exit(1);
        }

        await generateSdkCommand(projectName, options).catch(async (error) => {
            logError(error);
            await GenezioTelemetry.sendEvent({
                eventType: TelemetryEventTypes.GENEZIO_GENERATE_SDK_ERROR,
                errorTrace: error.message,
                commandOptions: JSON.stringify(options),
            });
            exit(1);
        });
    });

program
    .command("link")
    .option(
        "--projectName <projectName>",
        "The name of the project that you want to communicate with.",
    )
    .summary("Links the genezio generated SDK in the current working directory")
    .description(
        "Linking a client with a deployed project will enable `genezio local` to figure out where to generate the SDK to call the backend methods.\n\
This command is useful when the project has dedicated repositories for the backend and the frontend.",
    )
    .action(async (options: GenezioLinkOptions) => {
        await linkCommand(options.projectName).catch((error) => {
            logError(error);
            log.error(
                "Error: Command execution failed. Please ensure you are running this command from a directory containing 'genezio.yaml' or provide the '--projectName <name>' and '--region <region>' flags.",
            );
            exit(1);
        });
    });

program
    .command("unlink")
    .option("--all", "Remove all links.", false)
    .option(
        "--projectName <projectName>",
        "The name of the project that you want to communicate with. If --all is used, this option is ignored.",
    )
    .summary("Unlink the generated SDK from a client.")
    .description(
        "Clear the previously set path for your frontend app, which is useful when managing a project with multiple repositories.\n\
This reset allows 'genezio local' to stop automatically generating the SDK in that location.",
    )
    .action(async (options: GenezioUnlinkOptions) => {
        await unlinkCommand(options.all, options.projectName).catch((error) => {
            logError(error);
            log.error(
                "Error: Command execution failed. Please ensure you are running this command from a directory containing 'genezio.yaml' or provide the '--projectName <name>' and '--region <region>' flags.",
            );
            exit(1);
        });
    });

program
    .command("list")
    .argument("[identifier]", "Name or ID of the project you want to display.")
    .option("-l, --long-listed", "List more details for each project", false)
    .summary("List details about the deployed projects.")
    .description(
        "Display details of your projects. You can view them all at once or display a particular one by providing its name or ID.",
    )
    .action(async (identifier = "", options: GenezioListOptions) => {
        await lsCommand(identifier, options).catch(async (error) => {
            logError(error);
            await GenezioTelemetry.sendEvent({
                eventType: TelemetryEventTypes.GENEZIO_LS_ERROR,
                errorTrace: error.message,
                commandOptions: JSON.stringify(options),
            });
            exit(1);
        });
    });

program
    .command("delete")
    .argument("[projectId]", "ID of the project you want to delete.")
    .option("-f, --force", "Skip confirmation prompt for deletion.", false)
    .summary("Delete a deployed project.")
    .description(
        "Delete the project described by the provided ID. If no ID is provided, lists all the projects and IDs.",
    )
    .action(async (projectId = "", options: GenezioDeleteOptions) => {
        await deleteCommand(projectId, options).catch(async (error) => {
            logError(error);
            await GenezioTelemetry.sendEvent({
                eventType: TelemetryEventTypes.GENEZIO_DELETE_PROJECT_ERROR,
                errorTrace: error.toString(),
            });
            exit(1);
        });
    });

program
    .command("login")
    .argument("[accessToken]", "Set an access token to login with.")
    .summary("Login to the genezio platform.")
    .action(async (accessToken = "") => {
        await loginCommand(accessToken).catch(async (error) => {
            logError(error);
            await GenezioTelemetry.sendEvent({
                eventType: TelemetryEventTypes.GENEZIO_LOGIN_ERROR,
                errorTrace: error.message,
            });
            exit(1);
        });
    });

program
    .command("bundleClass", { hidden: true })
    .option("--className <className>", "The name of the class that needs to be bundled.")
    .option("--cloudAdapter <cloudAdapter>", "The cloud adapter that will be used.")
    .option("--output <output>", "The output path of the bundled class.")
    .action(async (options: GenezioBundleOptions) => {
        // TODO: implement cloud adapter option
        await bundleCommand(options).catch(async (error) => {
            logError(error);
            exit(1);
        });
    });

program
    .command("logout")
    .summary("Logout from the genezio platform.")
    .action(async () => {
        await logoutCommand().catch((error) => {
            logError(error);
            exit(1);
        });
    });

program
    .command("account")
    .summary("Display information about the current account.")
    .action(async () => {
        await accountCommand().catch((error) => {
            logError(error);
            exit(1);
        });
    });

export default program;
