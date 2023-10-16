import log from "loglevel";
import {
  GenezioTelemetry,
  TelemetryEventTypes,
} from "../telemetry/telemetry.js";
import { regions } from "../utils/configs.js";
import { writeToFile } from "../utils/file.js";
import { askQuestion } from "../utils/prompt.js";
import { cyan, red } from "../utils/strings.js";
import inquirer, { Answers } from "inquirer";
import { Language } from "../models/yamlProjectConfiguration.js";

export async function initCommand(path: string) {
  let projectName = "";
  let projectNameValidated = false;
  while (!projectNameValidated) {
    projectName = await askQuestion(`What is the name of the project: `);
    if (projectName.length === 0) {
      log.error(red, "The project name can't be empty. Please provide one.");
      continue;
    }

    if (!projectName.match(/^[a-zA-Z][-a-zA-Z0-9]*$/)) {
      log.error(
        red,
        "The project name can only contain letters, numbers, and dashes and must start with a letter.",
      );
      continue;
    }

    projectNameValidated = true;
  }

  let region = "";
  while (!regions.includes(region)) {
    region = await askQuestion(
      `What region do you want to deploy your project to? [default value: us-east-1]: `,
      "us-east-1",
    );

    if (!regions.includes(region)) {
      log.error(
        red,
        `The region is invalid. Please use a valid region.\n Region list: ${regions}`,
      );
    }
  }

  let projectLanguage = "";
  while (!["js", "ts", "dart"].includes(projectLanguage)) {
    projectLanguage = await askQuestion(
      `What language do you want to use for your project? [default value: ts]: `,
      "ts",
    );
  }

  const yamlConfigurationFileContent = `# Visit https://docs.genez.io/genezio-documentation/yaml-configuration-file to read more about this file

name: ${projectName}

# Configure where you want your project to be deployed. Choose the closest location to your users.
region: ${region}

# Configure the language of your project. The supported languages are: "js", "ts", "dart".
language: ${projectLanguage}

#sdk:
#  language: ts                                                                              # The supported languages are: "js", "ts", "dart", "python".
#  path: ../client/src/sdk/                                                                  # The path to the SDK folder. The SDK will be generated in this folder.

#frontend:
#  path: ../client/build/                                                                    # The path to the frontend build folder.
#  subdomain: your-awesome-domain                                                            # Uncomment if you want to specify a subdomain

# Define scripts that run at different stages of deployment.
#scripts:
#  preBackendDeploy: "echo 'preBackendDeploy'"                                               # The script that will run before the backend is deployed.
#  postBackendDeploy: "echo 'postBackendDeploy'"                                             # The script that will run after the backend is deployed.
#  preFrontendDeploy: "echo 'preFrontendDeploy'"                                             # The script that will run before the frontend is deployed.
#  postFrontendDeploy: "echo 'postFrontendDeploy'"                                           # The script that will run after the frontend is deployed.

# Specify the classes that will be handled by the genezio CLI.
#classes:
#  - path: "./index.js"                                                                      # The path to the class file.
#    type: jsonrpc
#    methods:
#      - name: "sayHiEveryMinute"
#        type: cron
#        cronString: "* * * * *"                                                             # The cron string that defines the schedule of the method.
#      - name: "helloWorldOverHttp"
#        type: http
#      - name: "helloWorldOverJsonrpc"
#        type: jsonrpc
#      - name: "helloWorldOverJsonrpcByDefault"
classes: []

# Specify the Node runtime version to be used by your application.
#options:
#  nodeRuntime: nodejs18.x                                                                   # The supported values are nodejs16.x, nodejs18.x.`;

  await writeToFile(
    path ? path : `./${projectName}`,
    "genezio.yaml",
    yamlConfigurationFileContent,
    true,
  ).catch((error) => {
    GenezioTelemetry.sendEvent({
      eventType: TelemetryEventTypes.GENEZIO_INIT_ERROR,
      errorTrace: error.toString(),
    });
    log.error(red, error.toString());
  });

  log.info("");
  log.info(cyan, "Your genezio project was successfully initialized!");
  log.info("");
  log.info(
    "The genezio.yaml configuration file was generated. You can now add the classes that you want to deploy using the 'genezio addClass <className> <classType>' command.",
  );
  log.info("");
}
