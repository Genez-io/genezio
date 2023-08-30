import { AxiosError } from "axios";
import { Spinner } from "cli-spinner";
import log from "loglevel";
import moment from "moment";
import { exit } from "process";
import { GENEZIO_NOT_AUTH_ERROR_MSG } from "../errors.js";
import listProjects from "../requests/listProjects.js";
import { GenezioTelemetry, TelemetryEventTypes } from "../telemetry/telemetry.js";
import { getAuthToken } from "../utils/accounts.js";


export async function lsCommand(identifier: string, options: any) {
  // check if user is logged in
  GenezioTelemetry.sendEvent({eventType: TelemetryEventTypes.GENEZIO_LS, commandOptions: JSON.stringify(options)});

  const authToken = await getAuthToken();
  if (!authToken) {
    log.error(GENEZIO_NOT_AUTH_ERROR_MSG);
    exit(1);
  }

  await lsHandler(identifier, options.longListed).catch(
    (error: AxiosError) => {
      if (error.response?.status === 401) {
        log.error(GENEZIO_NOT_AUTH_ERROR_MSG);
      } else {
        GenezioTelemetry.sendEvent({eventType: TelemetryEventTypes.GENEZIO_LS_ERROR, errorTrace: error.message, commandOptions: JSON.stringify(options)});
        log.error(error.message);
      }
      exit(1);
    }
  );
}

 async function lsHandler(identifier: string, l: boolean) {
  // show prompt if no project id is selected
  const spinner = new Spinner("%s  ");
  spinner.setSpinnerString("|/-\\");
  spinner.start();
  let projectsJson = await listProjects();
  spinner.stop();
  log.info("");
  if (projectsJson.length == 0) {
    log.info("There are no currently deployed projects.");
    return;
  }
  if (identifier.trim().length !== 0) {
    projectsJson = projectsJson.filter(
      (project) => project.name === identifier || project.id === identifier
    );
    if (projectsJson.length == 0) {
      log.info("There is no project with this identifier.");
      return;
    }
  }
  projectsJson.forEach(function (project: any, index: any) {
    if (l) {
      log.info(
        `[${1 + index}]: Project name: ${project.name},\n\tRegion: ${project.region
        },\n\tID: ${project.id},\n\tCreated: ${moment
          .unix(project.createdAt)
          .format()},\n\tUpdated: ${moment.unix(project.updatedAt).format()}`
      );
    } else {
      log.info(
        `[${1 + index}]: Project name: ${project.name}, Region: ${project.region
        }, Updated: ${moment.unix(project.updatedAt).format()}`
      );
    }
  });
}