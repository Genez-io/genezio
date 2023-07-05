export function getNoMethodClasses(classes: any) {
  const classesWithNoMethods = classes
    .filter((obj: any) => obj.methods.length === 0)
    .map((obj: any) => obj.name);

  return classesWithNoMethods;
}
