export function getNoMethodClasses(classes: any[]) {
  const classesWithNoMethods = classes
    .filter((obj) => obj.methods.length === 0)
    .map((obj) => obj.name);

  return classesWithNoMethods;
}
