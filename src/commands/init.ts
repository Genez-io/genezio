import log from "loglevel";
import { Document } from "yaml";
import { GenezioTelemetry, TelemetryEventTypes } from "../telemetry/telemetry.js";
import { regions } from "../utils/configs.js";
import { writeToFile } from "../utils/file.js";
import { askQuestion } from "../utils/prompt.js";
import {cyan, red} from "../utils/strings.js";

export async function initCommand(path:string) {
  let projectName = "";
  let projectNameValidated = false
  while (!projectNameValidated) {
    projectName = await askQuestion(`What is the name of the project: `);
    if (projectName.length === 0) {
      log.error(red, "The project name can't be empty. Please provide one.");
      continue;
    }

    if (!projectName.match(/^[a-zA-Z][-a-zA-Z0-9]*$/)) {
      log.error(red, "The project name can only contain letters, numbers, and dashes and must start with a letter.");
      continue;
    }

    projectNameValidated = true;
  }

  let region = "";
  while (!regions.includes(region)) {
    region = await askQuestion(
      `What region do you want to deploy your project to? [default value: us-east-1]: `,
      "us-east-1"
    );

    if (!regions.includes(region)) {
        log.error(red, `The region is invalid. Please use a valid region.\n Region list: ${regions}`);
    }
  }

  const configFile: any = {
    name: projectName,
    region: region,
    classes: []
  };

  GenezioTelemetry.sendEvent({eventType: TelemetryEventTypes.GENEZIO_INIT});


  const doc = new Document(configFile);
  const yamlConfigurationFileContent = doc.toString();

  await writeToFile(path ? path : `./${projectName}`, "genezio.yaml", yamlConfigurationFileContent, true).catch(
    (error) => {
      GenezioTelemetry.sendEvent({eventType: TelemetryEventTypes.GENEZIO_INIT_ERROR, errorTrace: error.toString()});
      log.error(red, error.toString());
    }
  );

  log.info("");
  log.info(
    cyan,
    "Your genezio project was successfully initialized!"
  );
  log.info("");
  log.info(
    "The genezio.yaml configuration file was generated. You can now add the classes that you want to deploy using the 'genezio addClass <className> <classType>' command."
  );
  log.info("");
}
