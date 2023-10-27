import path from "path";
import { getAuthToken } from "../utils/accounts.js";
import { fileExists, getAllFilesFromCurrentPath } from "../utils/file.js";
import { loginCommand } from "./login.js";
import { debugLogger } from "../utils/logging.js";
import { deployCommand } from "./deploy.js";
import log from "loglevel";
import colors from "colors";
import inquirer, { Answers } from "inquirer";
import { regions } from "../utils/configs.js";


export async function genezioCommand() {
  const pwd = process.cwd();

  if (!await getAuthToken()) {
    await loginCommand("", false);
  }

  // check if there is a genezio.yaml file in the current directory
  if (await fileExists(path.join(pwd, "genezio.yaml"))) {
    debugLogger.debug("genezio.yaml file found in current directory");
    log.info(colors.cyan("genezio.yaml file found in current directory. Running deploy command..."));
    await deployCommand({installDeps: true});
    return;
  }

  let emptyDirectory = false;

  // check if the folder is empty
  if ((await getAllFilesFromCurrentPath()).length === 0) {
    debugLogger.debug("Current directory is empty");
    emptyDirectory = true;
  }

  // Choose a template for your genezio project
  const templateAnswer: Answers = await inquirer.prompt([
    {
      type: "list",
      name: "template",
      message: colors.magenta("Choose a template for your genezio project"),
      choices: ["Backend-only", "Fullstack"]
    },
  ]);

  log.info(colors.cyan(`Your project will start from the ${templateAnswer.template} template.`));

  const projectNameAnswer: Answers = await inquirer.prompt([
    {
      type: "input",
      name: "projectName",
      message: colors.magenta("Please enter a name for your app [genezio-getting-started]:"),
      default: "genezio-getting-started"
    },
  ]);

  log.info(colors.cyan(`Your project will be named ${projectNameAnswer.projectName}.`));

  const regionAnswer: Answers = await inquirer.prompt([
    {
      type: "list",
      name: "region",
      message: colors.magenta("Choose a region for your project"),
      choices: regions
    },
  ]);

  log.info(colors.cyan(`Your project will be deployed in ${regionAnswer.region}.`));

  let directoryName = "";
  const template = templateAnswer.template;
  const projectName = projectNameAnswer.projectName;
  const region = regionAnswer.region;

  if (!emptyDirectory) {
    const confirmAnswer: Answers = await inquirer.prompt([
      {
        type: "input",
        name: "directoryName",
        message: colors.magenta("Please enter a name for your directory [genezio-getting-started]"),
        default: "genezio-getting-started"
      },
    ]);

    log.info(colors.cyan(`We are creatin the project in ./${confirmAnswer.directoryName}.`));
    directoryName = confirmAnswer.directoryName;
  }









}