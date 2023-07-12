import log from "loglevel";
import path from "path";
import { TriggerType } from "../models/yamlProjectConfiguration.js";
import { GenezioTelemetry } from "../telemetry/telemetry.js";
import { getProjectConfiguration } from "../utils/configuration.js";
import { fileExists, writeToFile } from "../utils/file.js";

export async function addClassCommand(classPath: string, classType: string) {
  GenezioTelemetry.sendEvent({eventType: "GENEZIO_ADD_CLASS"});

  if (classType === undefined) {
    classType = "jsonrpc";
  } else if (!["http", "jsonrpc"].includes(classType)) {
    throw new Error(
      "Invalid class type. Valid class types are 'http' and 'jsonrpc'."
    );
  }

  if (classPath === undefined || classPath === "") {
    throw new Error("Please provide a path to the class you want to add.");
  }

  const projectConfiguration = await getProjectConfiguration();

  const className = classPath.split(path.sep).pop();

  if (!className) {
    throw new Error("Please provide a valid class path.");
  }

  const classExtension = className.split(".").pop();
  if (!classExtension || className.split(".").length < 2) {
    throw new Error("Please provide a class name with a valid class extension.");
  }

  // check if class already exists
  if (projectConfiguration.classes.length > 0) {
    if (
      projectConfiguration.classes
        .map((c) => c.path.split(path.sep).pop())
        .includes(className)
    ) {
      throw new Error("Class already exists.");
    }
  }

  // create the file if it does not exist
  if (!(await fileExists(classPath))) {
    await writeToFile(".", classPath, "", true).catch((error) => {
      log.error(error.toString());
      GenezioTelemetry.sendEvent({eventType: "GENEZIO_ADD_CLASS_ERROR", errorTrace: error.toString()});
      throw error;
    });
  }

  projectConfiguration.addClass(classPath, classType as TriggerType, []);
  await projectConfiguration.writeToFile();

  log.info("\x1b[36m%s\x1b[0m", "Class added successfully.");
}
