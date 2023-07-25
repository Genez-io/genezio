import { ClassConfiguration } from "../models/projectConfiguration.js";

export function getNoMethodClasses(classes: ClassConfiguration[]) {
  const classesWithNoMethods = classes
    .filter((obj) => obj.methods.length === 0)
    .map((obj) => obj.name);

  return classesWithNoMethods;
}
