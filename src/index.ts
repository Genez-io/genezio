#! /usr/bin/env node

import { Command } from "commander";
import { deployFunctions, generateSdks, init } from "./commands";
import { writeToken } from "./utils/file";
import Server from "./localEnvironment";
import chokidar from "chokidar";
import path from "path";
import { CLIENT_RENEG_WINDOW } from "tls";
import open from "open";
import { asciiCapybara } from "./utils/strings";
import http, { request } from "http";
import jsonBody from "body/json";
import { createHttpTerminator } from "http-terminator";
import keytar from "keytar";

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
    writeToken(code);
    open("http://localhost:3000?redirect_url=http://localhost:8000");
    console.log(asciiCapybara);
    let token : string = "";
    const server = http.createServer((req, res) => {
      jsonBody(req, res, (err, body : any) => {
        token = body.token;
        keytar.setPassword("genez.io", "stefan", token).then(() => {
          res.writeHead(200);
          res.end("Token recieved!");
        });
      });
      const httpTerminator = createHttpTerminator({ server });
      httpTerminator.terminate();
    });
    
    server.listen(8000, 'localhost', () => {
      console.log("Waiting for token...");
    });
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
      let server = new Server();

      const runServer = async () => {
        const handlers = await server.generateHandlersFromFiles();
        server.start(handlers);
      };

      runServer();

      // Watch for changes in the classes and update the handlers
      const cwd = process.cwd();
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
