#! /usr/bin/env node

import { Command } from "commander";
import { deployFunctions, generateSdks, init } from "./commands";
import { fileExists, writeToken, readUTF8File } from "./utils/file";
import Server from "./localEnvironment";
import chokidar from "chokidar";
import path from "path";
import { parse } from "yaml"

const program = new Command();

program
  .name("genezio")
  .description("CLI to interact with the Genezio infrastructure!")
  .version("0.1.0");

program
  .command("init")
  .description("Initialize a Genezio project.")
  .action(async () => {
    await init();
  });

program
  .command("login")
  .argument("<code>", "The authentication code.")
  .description("Authenticate with Genezio platform to deploy your code.")
  .action(async (code) => {
    writeToken(code)
  });

program
  .command("deploy")
  .description(
    "Deploy the functions mentioned in the genezio.yaml file to Genezio infrastructure."
  )
  .action(async () => {
    await deployFunctions().catch((error: Error) => {
      console.error(error.message);
    });
  });

program
  .command("generateSdk")
  .argument(
    "<env>",
    'The environment used to make requests. Available options: "local" or "production".'
  )
  .description("Generate the SDK.")
  .action(async (env) => {
    switch (env) {
      case "local":
        await generateSdks(env)
          .then(() => {
            console.log("Your SDK was successfully generated!");
          })
          .catch((error: Error) => {
            console.error(`${error}`);
          });
        break;
      case "production":
        await deployFunctions().catch((error: Error) => {
          console.error(error);
        });
        break;
      default:
        console.error(
          `Wrong env value ${env}. Available options: "local" or "production".`
        );
    }
  });

program
  .command("local")
  .description("Run a local environment for your functions.")
  .action(async () => {
    try {
      const configurationFileContentUTF8 = await readUTF8File('./genezio.yaml')
      const configurationFileContent = await parse(configurationFileContentUTF8);
      const cwd = process.cwd();
      if (!(await fileExists(path.join(cwd, configurationFileContent.sdk.path))))
        await generateSdks("local")
            .then(() => {
              console.log("Your SDK was successfully generated!");
            })
            .catch((error: Error) => {
              console.error(`${error}`);
            });
      let server = new Server();

      const runServer = async () => {
        const handlers = await server.generateHandlersFromFiles();
        server.start(handlers);
      };

      runServer();

      // Watch for changes in the classes and update the handlers
      const watchPaths = [path.join(cwd, "/**/*")];
      const ignoredPaths = "**/node_modules/*";

      const startWatching = () => {
        chokidar
          .watch(watchPaths, {
            ignored: ignoredPaths,
            ignoreInitial: true
          })
          .on("all", async (event, path) => {
            console.clear();
            console.log("\x1b[36m%s\x1b[0m", "Change detected, reloading...");
            await server.terminate();
            runServer();
          });
      };
      startWatching();
    } catch (error) {
      console.error(`${error}`);
    }
  });

program.parse();
