import log from "loglevel";
import path from "path";
import { newClassTemplateNode } from "../generateSdk/templates/newProject.js";

import { YamlClassConfiguration } from "../models/yamlProjectConfiguration.js";
import { GenezioTelemetry, TelemetryEventTypes } from "../telemetry/telemetry.js";
import { getProjectConfiguration } from "../utils/configuration.js";
import { fileExists, writeToFile } from "../utils/file.js";
import { supportedExtensions } from "../utils/languages.js";

export async function addClassCommand(classPath: string, classType: string) {
    GenezioTelemetry.sendEvent({
        eventType: TelemetryEventTypes.GENEZIO_ADD_CLASS,
    });

    if (classType === undefined) {
        classType = "jsonrpc";
    } else if (!["http", "jsonrpc"].includes(classType)) {
        throw new Error("Invalid class type. Valid class types are 'http' and 'jsonrpc'.");
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

    // check if class is supported
    if (!supportedExtensions.includes(classExtension)) {
        const supportedExtensionsString =
            supportedExtensions.slice(0, -1).join(", ") +
            (supportedExtensions.length > 1 ? " and " : "") +
            supportedExtensions.slice(-1);
        throw new Error(
            `Class language(${classExtension}) not supported. Currently supporting: ${supportedExtensionsString}`,
        );
    }

    // check if class already exists
    if (projectConfiguration.classes.length > 0) {
        if (
            projectConfiguration.classes
                .map((c: YamlClassConfiguration) => c.path.split(path.sep).pop())
                .includes(className)
        ) {
            throw new Error("Class already exists.");
        }
    }

    let classContent = "";

    if (["js", "ts"].includes(classExtension)) {
        let name = className.split(".")[0];
        name = (name.charAt(0).toUpperCase() + name.slice(1))
            .replaceAll("-", "")
            .replaceAll("_", "")
            .replaceAll(" ", "")
            .replaceAll(".", "");

        classContent = newClassTemplateNode(name);
    }

    // create the file if it does not exist
    if (!(await fileExists(classPath))) {
        await writeToFile(".", classPath, classContent, true).catch((error) => {
            log.error(error.toString());
            GenezioTelemetry.sendEvent({
                eventType: TelemetryEventTypes.GENEZIO_ADD_CLASS_ERROR,
                errorTrace: error.toString(),
            });
            throw error;
        });
    }

    log.info("\x1b[36m%s\x1b[0m", "Class added successfully.");
}
