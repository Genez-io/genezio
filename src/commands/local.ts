import log from "loglevel";
import { exit } from "process";
import { LOCAL_TEST_INTERFACE_URL } from "../constants";
import { GENEZIO_NOT_AUTH_ERROR_MSG } from "../errors";
import { AstSummary } from "../models/astSummary";
import { LocalEnvCronHandler, LocalEnvStartServerOutput } from "../models/localEnvInputParams";
import { getAuthToken } from "../utils/accounts";
import { getProjectConfiguration } from "../utils/configuration";
import { startLocalTesting, listenForChanges, startServer } from "../utils/localEnvironment";


export async function localCommand(options: any) {
  const authToken = await getAuthToken();
  if (!authToken) {
    log.error(GENEZIO_NOT_AUTH_ERROR_MSG);
    exit(1);
  }

  let classesInfo: { className: any; methods: any; path: string; functionUrl: string; tmpFolder: string }[] = [];

  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const projectConfiguration = await getProjectConfiguration();

      let server: any = undefined;
      let handlers = undefined;
      let astSummary: AstSummary | undefined = undefined;
      let cronHandlers: LocalEnvCronHandler[] = [];
      await startLocalTesting(classesInfo, options)
        .catch(async (error: Error) => {
          if (error.message === "Unauthorized" || error.message.includes("401")) {
            log.error(GENEZIO_NOT_AUTH_ERROR_MSG);
            exit(1);
          } else if (error.message.includes("No classes found")) {
            log.error(error.message);
            exit(1);
          }
          log.error("\x1b[31m%s\x1b[0m", `Error while preparing for local environment:\n${error.message}`);
          log.error(`Fix the errors and genezio local will restart automatically. Waiting for changes...`);

          await listenForChanges(null, null, null).catch(
            (error: Error) => {
              log.error(error.message);
              exit(1);
            }
          );
          return null;
        })
        .then(async (responseStartLocal: any) => {
          if (responseStartLocal === null) {
            return;
          }

          handlers = responseStartLocal.handlers;
          astSummary = responseStartLocal.astSummary;
          classesInfo = responseStartLocal.classesInfo;
          if (handlers != undefined) {
            log.info(
              "\x1b[32m%s\x1b[0m",
              `Test your code at ${LOCAL_TEST_INTERFACE_URL}?port=${options.port}`
            );
            const startServerOutput: LocalEnvStartServerOutput = await startServer(
              classesInfo,
              handlers,
              astSummary,
              Number(options.port),
              projectConfiguration.name
            );

            server = startServerOutput.server;
            cronHandlers = startServerOutput.cronHandlers;


            server.on("error", (error: any) => {
              if (error.code === "EADDRINUSE") {
                log.error(
                  `The port ${error.port} is already in use. Please use a different port by specifying --port <port> to start your local server.`
                );
              } else {
                log.error(error.message);
              }
              exit(1);
            });
          } else {
            log.info("\x1b[36m%s\x1b[0m", "Listening for changes...");
          }

          await listenForChanges(projectConfiguration.sdk.path, server, cronHandlers).catch(
            (error: Error) => {
              log.error(error.message);
              exit(1);
            }
          );
        })
    }
  } catch (error: any) {
    log.error(error.message);
    exit(1);
  }
}