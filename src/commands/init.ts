import log from "loglevel";
import { Document } from "yaml";
import { regions } from "../utils/configs";
import { writeToFile } from "../utils/file";
import { languages } from "../utils/languages";
import { askQuestion } from "../utils/prompt";
import {cyan, red} from "../utils/strings";
export async function initCommand() {
  let projectName = "";
  while (projectName.length === 0) {
    projectName = await askQuestion(`What is the name of the project: `);
    if (projectName.length === 0) {
      log.error(red, "The project name can't be empty. Please provide one.");
    }
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

  let sdkLanguage = "";
  while (!languages.includes(sdkLanguage)) {
    sdkLanguage = await askQuestion(
      `In what programming language do you want your SDK? (${languages}) [default value: ts]: `,
      "ts"
    );

    if (!languages.includes(sdkLanguage)) {
      log.error(red, `We don't currently support the ${sdkLanguage} language. You can open an issue ticket at https://github.com/Genez-io/genezio/issues.`);
    }
  }

  const path = await askQuestion(
    `Where do you want to save your SDK? [default value: ./sdk/]: `,
    "./sdk/"
  );

  const configFile: any = {
    name: projectName,
    region: region,
    sdk: {
      language: sdkLanguage,
      path: path
    },
    classes: []
  };

  const doc = new Document(configFile);
  const yamlConfigurationFileContent = doc.toString();

  await writeToFile(".", "genezio.yaml", yamlConfigurationFileContent).catch(
    (error) => {
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
