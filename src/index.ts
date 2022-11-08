#! /usr/bin/env node

import { Command } from "commander";
import {
  deployFunctions,
  generateSdks,
  init,
  addNewClass,
  checkYamlFile,
  generateLocalSdk
} from "./commands";
import { fileExists, readUTF8File, readToken } from "./utils/file";
import Server from "./localEnvironment";
import chokidar from "chokidar";
import path from "path";
import { parse } from "yaml";
import open from "open";
import { asciiCapybara } from "./utils/strings";
import http from "http";
import jsonBody from "body/json";
import keytar from "keytar";
import { PORT_LOCAL_ENVIRONMENT, REACT_APP_BASE_URL } from "./variables";
import { exit } from "process";
import { AxiosError } from "axios";
import { AddressInfo } from "net";

const program = new Command();

program
  .name("genezio")
  .description("CLI to interact with the Genezio infrastructure!")
  .version("0.1.0");

program
  .command("init")
  .description("Initialize a Genezio project.")
  .action(async () => {
    try {
      await init();
    } catch (error: any) {
      console.error(error.message);
    }
  });

program
  .command("login")
  .description("Authenticate with Genezio platform to deploy your code.")
  .action(async () => {
    console.log(asciiCapybara);

    const server = http.createServer((req, res) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      res.setHeader("Access-Control-Allow-Methods", "POST");
      res.setHeader("Access-Control-Allow-Credentials", "true");
      if (req.method === "OPTIONS") {
        res.end();
        return;
      }
      jsonBody(req, res, (err, body: any) => {
        const params = new URLSearchParams(req.url);

        const token = params.get("/?token")!;
        const user = JSON.parse(params.get("user")!);
        const name = user.name || "genezio-username";

        // delete all existing tokens for service genez.io
        keytar
          .findCredentials("genez.io")
          .then(async (credentials) => {
            // delete all existing tokens for service genez.io before adding the new one
            for (const elem of credentials) {
              await keytar.deletePassword("genez.io", elem.account);
            }
          })
          .then(() => {
            // save new token
            keytar.setPassword("genez.io", name, token).then(() => {
              console.log(
                `Welcome, ${name}! You can now start using genez.io.`
              );
              res.setHeader("Access-Control-Allow-Origin", "*");
              res.setHeader("Access-Control-Allow-Headers", "Content-Type");
              res.setHeader("Access-Control-Allow-Methods", "POST");
              res.setHeader("Access-Control-Allow-Credentials", "true");
              res.writeHead(301, {
                Location: `${REACT_APP_BASE_URL}/cli/login/success`
              });
              res.end();

              exit(0);
            });
          })
          .catch((error) => {
            console.log(error);
          });
      });
    });

    const promise = new Promise((resolve) => {
      server.listen(0, "localhost", () => {
        console.log("Redirecting to browser to complete authentication...");
        const address = server.address() as AddressInfo;
        resolve(address.port);
      });
    });

    const port = await promise;
    const browserUrl = `${REACT_APP_BASE_URL}/cli/login?redirect_url=http://localhost:${port}/`;
    open(browserUrl);
  });

program
  .command("deploy")
  .description(
    "Deploy the functions mentioned in the genezio.yaml file to Genezio infrastructure."
  )
  .action(async () => {
    // check if user is logged in
    const authToken = await readToken().catch(() => undefined);

    if (!authToken) {
      console.log(
        "You are not logged in. Run 'genezio login' before you deploy your function."
      );
      exit(1);
    }

    await checkYamlFile();

    await deployFunctions().catch((error: AxiosError) => {
      if (error.response?.status == 401) {
        console.log(
          "You are not logged in or your token is invalid. Please run `genezio login` before you deploy your function."
        );
      } else {
        console.error(error.message);
      }
      exit(1);
    });

    console.log("Your project has been deployed");
  });

program
  .command("addClass")
  .argument("<classPath>", "Path of the class you want to add.")
  .argument(
    "[<classType>]",
    "The tipe of the class you want to add. [http, jsonrpc]"
  )
  .description("Add a new class to the genezio.yaml file.")
  .action(async (classPath: string, classType: string) => {
    try {
      addNewClass(classPath, classType);
    } catch (error: any) {
      console.error(error.message);
    }
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
        await generateLocalSdk()
          .then(() => {
            console.log(`Your ${env} SDK was successfully generated!`);
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
          `${env} is not a valid environment. Available options: “local” or “production”`
        );
    }
  });

program
  .command("local")
  .description("Run a local environment for your functions.")
  .action(async () => {
    try {
      const configurationFileContentUTF8 = await readUTF8File("./genezio.yaml");
      const configurationFileContent = await parse(
        configurationFileContentUTF8
      );
      const cwd = process.cwd();

      const functionUrlForFilePath: any = {};

      const server = new Server();

      const runServer = async () => {
        const classes = await server.generateHandlersFromFiles();
        for (const classElement of classes) {
          functionUrlForFilePath[
            classElement.fileName
          ] = `http://127.0.0.1:${PORT_LOCAL_ENVIRONMENT}/${classElement.className}`;
        }
        await generateSdks(functionUrlForFilePath)
          .then(async () => {
            await server.start();
          })
          .catch((error: Error) => {
            console.error(`${error.stack}`);
          });
      };

      await runServer();
      // get absolute path of configurationFileContent.sdk.path
      let sdkPath = path.join(cwd, configurationFileContent.sdk.path);

      // delete / if sdkPath ends with /
      if (sdkPath.endsWith("/")) {
        sdkPath = sdkPath.slice(0, -1);
      }

      // Watch for changes in the classes and update the handlers
      const watchPaths = [path.join(cwd, "/**/*")];
      const ignoredPaths = [
        "**/node_modules/*",
        sdkPath + "/**/*",
        sdkPath + "/*"
      ];

      const startWatching = () => {
        chokidar
          .watch(watchPaths, {
            ignored: ignoredPaths,
            ignoreInitial: true
          })
          .on("all", async (event, path) => {
            if (path.includes(sdkPath) || !server.isRunning()) {
              return;
            }

            console.clear();
            console.log("\x1b[36m%s\x1b[0m", "Change detected, reloading...");
            await server.terminate();
            await runServer();
          });
      };
      startWatching();
    } catch (error) {
      console.error(`${error}`);
    }
  });

program
  .command("logout")
  .description("Logout from Genezio platform.")
  .action(async () => {
    keytar
      .findCredentials("genez.io")
      .then(async (credentials) => {
        credentials.forEach(async (credential) => {
          await keytar.deletePassword("genez.io", credential.account);
        });
      })
      .then(() => {
        console.log("You are now logged out!");
      })
      .catch(() => {
        console.log("Logout failed!");
      });
  });

program
  .command("account")
  .description("Display currently logged in account.")
  .action(
    async () => {
      keytar
        .findCredentials("genez.io")
        .then(async (credentials) => {
          if (Array.isArray(credentials) && credentials.length) {
            credentials.forEach(async (credential) => {
              console.log("Logged in as: " + credential.account);
            })
          } else {
            console.log("Unauthorized. You are not logged in.")
          }
        })
        .catch(() => {
          console.log("Cannot access keychain.")
        })
    }
  );

program.parse();
