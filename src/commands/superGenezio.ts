import path from "path";
import { getAuthToken } from "../utils/accounts.js";
import {
    deleteFolder,
    fileExists,
    getAllFilesFromCurrentPath,
    readUTF8File,
    writeToFile,
} from "../utils/file.js";
import { loginCommand } from "./login.js";
import { debugLogger, printAdaptiveLog } from "../utils/logging.js";
import { deployCommand } from "./deploy.js";
import log from "loglevel";
import colors from "colors";
import inquirer, { Answers } from "inquirer";
import { regions, regionNames } from "../utils/configs.js";
import { runNewProcessWithResultAndReturnCode } from "../utils/process.js";
import { GENEZIO_GIT_NOT_FOUND } from "../errors.js";
import { GenezioCommandTemplates } from "../models/genezioModels.js";
import {
    BACKEND_TEMPLATE_GIT_URL,
    FULLSTACK_TEMPLATE_GIT_URL,
} from "../generateSdk/templates/newProject.js";
import { exit } from "process";

export async function genezioCommand() {
    // check if git is installed
    const gitInstalled = await runNewProcessWithResultAndReturnCode("git --version");
    if (gitInstalled.code !== 0) {
        log.error(colors.red(GENEZIO_GIT_NOT_FOUND));
        return;
    }

    if (!(await getAuthToken())) {
        debugLogger.debug("No auth token found");
        await loginCommand("", false);
    } else {
        debugLogger.debug("Auth token found");
    }

    printAdaptiveLog("Loading", "start");

    // check if there is a genezio.yaml file in the current directory
    if (await fileExists(path.join(process.cwd(), "genezio.yaml"))) {
        printAdaptiveLog("Loading", "end");
        debugLogger.debug("genezio.yaml file found in current directory");
        log.info(
            colors.cyan(
                "genezio.yaml file found in current directory. Running deploy command...\n",
            ),
        );
        await deployCommand({ installDeps: true });
        return;
    }

    let emptyDirectory = false;

    // check if the folder is empty
    if ((await getAllFilesFromCurrentPath()).length === 0) {
        debugLogger.debug("Current directory is empty");
        emptyDirectory = true;
    }

    printAdaptiveLog("Loading", "end");

    // Choose a template for your genezio project
    const templateAnswer: Answers = await inquirer.prompt([
        {
            type: "list",
            name: "template",
            message: colors.magenta("Choose a template for your genezio project"),
            choices: (
                Object.keys(GenezioCommandTemplates) as (keyof typeof GenezioCommandTemplates)[]
            ).map((key) => {
                return GenezioCommandTemplates[key];
            }),
        },
    ]);

    log.info(
        colors.cyan(
            `Your project will start from the ${colors.green(templateAnswer["template"])} template.\n`,
        ),
    );

    // must match regex [a-zA-Z][-a-zA-Z0-9]*

    const projectNameAnswer: Answers = await inquirer.prompt([
        {
            type: "input",
            name: "projectName",
            message: colors.magenta("Please enter a name for your project:"),
            default: "genezio-getting-started",
            validate: (input: string) => {
                const regex = /^[a-zA-Z][-a-zA-Z0-9]*$/;
                if (!regex.test(input)) {
                    return colors.red("The name must match the regex [a-zA-Z][-a-zA-Z0-9]*");
                }
                return true;
            },
        },
    ]);

    log.info(
        colors.cyan(`Your project will be named ${colors.green(projectNameAnswer["projectName"])}.\n`),
    );

    const regionAnswer: Answers = await inquirer.prompt([
        {
            type: "list",
            name: "region",
            message: colors.magenta("Choose a region for your project"),
            choices: regionNames,
            // show full list
            pageSize: regionNames.length,
        },
    ]);

    log.info(
        colors.cyan(`Your project will be deployed in ${colors.green(regionAnswer["region"])}.\n`),
    );

    // TODO: To be added in the future
    // const packageManagerAnswer: Answers = await inquirer.prompt([
    //   {
    //     type: "list",
    //     name: "packageManager",
    //     message: colors.magenta("Choose the package manager for your project"),
    //     choices: Object.keys(PackageManager).filter((key) =>
    //     isNaN(Number(key))),
    //   },
    // ]);

    // log.info(colors.cyan(`Your project will use ${colors.green(packageManagerAnswer.packageManager)} as package manager.\n`));

    let directoryName = ".";
    const template: string = templateAnswer["template"];
    const projectName = projectNameAnswer["projectName"];
    const region = regions[regionNames.indexOf(regionAnswer["region"])];

    if (!emptyDirectory) {
        const confirmAnswer: Answers = await inquirer.prompt([
            {
                type: "input",
                name: "directoryName",
                message: colors.magenta("Please enter a name for your directory:"),
                default: projectName,
            },
        ]);

        log.info(
            colors.cyan(
                `We are creating the project in ${colors.green(
                    `./${confirmAnswer["directoryName"]}`,
                )}.\n`,
            ),
        );
        directoryName = confirmAnswer["directoryName"];
    } else {
        log.info(colors.cyan(`We are creating the project in the current directory.\n\n`));
    }

    printAdaptiveLog("Creating the project", "start");

    await prepareProjectFolder(template, projectName, region, directoryName);

    printAdaptiveLog("Creating the project", "end");

    log.info(colors.green(`Deploying your project...\n`));
    // change cwd to the new project folder
    process.chdir(path.join(process.cwd(), directoryName));
    await deployCommand({ installDeps: true });
    return;
}

export async function prepareProjectFolder(
    template: string,
    projectName: string,
    region: string,
    directoryName: string,
) {
    const gitUrl = await getTemplateGitUrl(template);

    if (!gitUrl) {
        log.error(colors.red("Template not found"));
        exit(1);
    }

    const cloneRes = await runNewProcessWithResultAndReturnCode(
        `git clone ${gitUrl} ${directoryName}`,
    );

    if (cloneRes.code !== 0) {
        log.error(colors.red("Error cloning template"));
        return;
    }

    // delete .git
    const deleteRes = deleteFolder(path.join(process.cwd(), directoryName, ".git")).catch((err) => {
        log.error(colors.red(`Error deleting .git folder: ${err}`));
        return;
    });
    if (!deleteRes) {
        return;
    }

    // replace project name and region
    const genezioYamlContent = (
        await readUTF8File(path.join(process.cwd(), directoryName, "genezio.yaml"))
    )
        .replace("template-name", projectName)
        .replace("us-east-1", region);

    await writeToFile(path.join(process.cwd(), directoryName), "genezio.yaml", genezioYamlContent);

    // replace install sdk command in client package.json
    if (genezioYamlContent.includes("frontend: client")) {
        // replace in package.json
        const clientPackageJsonContent = (
            await readUTF8File(path.join(process.cwd(), directoryName, "client", "package.json"))
        ).replaceAll(
            "@genezio-sdk/template-name_us-east-1",
            `@genezio-sdk/${projectName}_${region}`,
        );

        await writeToFile(
            path.join(process.cwd(), directoryName, "client"),
            "package.json",
            clientPackageJsonContent,
        );

        // replace in src/App.tsx
        const clientAppTsxContent = (
            await readUTF8File(path.join(process.cwd(), directoryName, "client", "src", "App.tsx"))
        ).replaceAll(
            "@genezio-sdk/template-name_us-east-1",
            `@genezio-sdk/${projectName}_${region}`,
        );

        await writeToFile(
            path.join(process.cwd(), directoryName, "client", "src"),
            "App.tsx",
            clientAppTsxContent,
        );

        // TODO: replace in a dynamic way the import of the sdk in the client for all the files
    }
}

export async function getTemplateGitUrl(template: string) {
    switch (template) {
        case GenezioCommandTemplates.FULLSTACK:
            return FULLSTACK_TEMPLATE_GIT_URL;
        case GenezioCommandTemplates.BACKEND:
            return BACKEND_TEMPLATE_GIT_URL;
        default:
            return "";
    }
}
