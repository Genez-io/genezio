import {
  ClassDefinition,
  PropertyDefinition,
  MethodDefinition,
  ParameterDefinition
} from "../astGenerator/astGenerator.interface";
import {
  AstSummaryClass,
  AstSummaryInfo,
  AstSummaryMethod,
  AstSummaryParam
} from "../models/astSummary";
import {
  ClassConfiguration,
  ProjectConfiguration
} from "../models/projectConfiguration.model";

export function getAstSummary(
  projectConfiguration: ProjectConfiguration
): AstSummaryClass[] {
  const classes: AstSummaryClass[] = projectConfiguration
    .getAllClasses()
    .filter((classConfiguration: ClassConfiguration) => {
      const body: [ClassDefinition | PropertyDefinition] | undefined =
        classConfiguration.program.body;
      // filter if body is undefined
      if (body === undefined) {
        return false;
      }
      return true;
    })
    .map((classConfiguration: ClassConfiguration) => {
      const body: [ClassDefinition | PropertyDefinition] | undefined =
        classConfiguration.program.body;

      // get the class definition
      const classElem: ClassDefinition = body?.find((elem) => {
        return elem.type === "ClassDefinition";
      }) as ClassDefinition;

      const methods: AstSummaryMethod[] = classElem.methods.map(
        (method: MethodDefinition) => {
          const params: AstSummaryParam[] = method.params.map(
            (param: ParameterDefinition) => {
              return {
                name: param.name,
                type: param.rawType
              };
            }
          );

          const methodInfo: AstSummaryMethod = {
            name: method.name,
            type: projectConfiguration.getMethodType(
              classConfiguration.path,
              method.name
            ),
            params: params
          };
          return methodInfo;
        }
      );

      const classInfo: AstSummaryClass = {
        name: classElem.name,
        path: classConfiguration.path,
        methods: methods
      };
      return classInfo;
    });

  return classes;
}
