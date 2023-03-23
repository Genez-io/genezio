import log from "loglevel";
import { Document } from "yaml";
import { regions } from "../utils/configs";
import { writeToFile } from "../utils/file";
import { languages } from "../utils/languages";
import { askQuestion } from "../utils/prompt";
import { GENEZIO_YAML_COMMENT } from "../utils/strings";

export async function initCommand() {
  let projectName = "";
  while (projectName.length === 0) {
    projectName = await askQuestion(`What is the name of the project: `);
    if (projectName.length === 0) {
      log.error("The project name can't be empty.");
    }
  }
  const configFile: any = {
    name: projectName,
    region: "",
    sdk: { options: {} },
    classes: []
  };

  const region = await askQuestion(
    `What region do you want to deploy your project to? [default value: us-east-1]: `,
    "us-east-1"
  );

  if (!regions.includes(region)) {
    throw Error(
      `The region is invalid. Please use a valid region.\n Region list: ${regions}`
    )
  }
  configFile.region = region;

  const sdkLanguage = await askQuestion(
    `In what programming language do you want your SDK? (js, ts, swift or python) [default value: js]: `,
    "js"
  );

  if (!languages.includes(sdkLanguage)) {
    throw Error(
      `We don't currently support the ${sdkLanguage} language. You can open an issue ticket at https://github.com/Genez-io/genezio/issues.`
    );
  }
  configFile.sdk.language = sdkLanguage;

  if (sdkLanguage === "js" || sdkLanguage === "ts") {
    const runtime = await askQuestion(
      `What runtime will you use? Options: "node" or "browser". [default value: node]: `,
      "node"
    );
    if (runtime !== "node" && runtime !== "browser") {
      throw Error(`We don't currently support this JS/TS runtime ${runtime}.`);
    }

    configFile.sdk.options.runtime = runtime;
  }

  const path = await askQuestion(
    `Where do you want to save your SDK? [default value: ./sdk/]: `,
    "./sdk/"
  );
  configFile.sdk.path = path;

  const doc = new Document(configFile);
  doc.commentBefore = GENEZIO_YAML_COMMENT

  const yamlConfigurationFileContent = doc.toString();

  await writeToFile(".", "genezio.yaml", yamlConfigurationFileContent).catch(
    (error) => {
      log.error(error.toString());
    }
  );

  log.info("");
  log.info(
    "\x1b[36m%s\x1b[0m",
    "Your genezio project was successfully initialized!"
  );
  log.info("");
  log.info(
    "The genezio.yaml configuration file was generated. You can now add the classes that you want to deploy using the 'genezio addClass <className> <classType>' command."
  );
  log.info("");
}
