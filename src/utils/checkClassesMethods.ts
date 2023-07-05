export const checkClassesMethods = (classes: any) => {
  const classesWithEmptyMethods = classes
    .filter((obj: any) => obj.methods.length === 0)
    .map((obj: any) => obj.name);

  return classesWithEmptyMethods;
};
