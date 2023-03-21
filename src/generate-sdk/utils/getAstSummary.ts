import {
  ClassDefinition,
  MethodDefinition,
  ParameterDefinition,
  PropertyDefinition,
  SdkGeneratorClassesInfoInput
} from "../../models/genezioModels";
import {
  AstSummaryClass,
  AstSummaryMethod,
  AstSummaryParam
} from "../models/astSummary";


export function getAstSummary(
  classesInfo: SdkGeneratorClassesInfoInput[]
): AstSummaryClass[] {
  const classes: AstSummaryClass[] = classesInfo
    .filter((classConfiguration: SdkGeneratorClassesInfoInput) => {
      const body: [ClassDefinition | PropertyDefinition] | undefined =
        classConfiguration.program.body;
      // filter if body is undefined
      if (body === undefined) {
        return false;
      }
      return true;
    })
    .map((classConfiguration: SdkGeneratorClassesInfoInput) => {
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
            type: classConfiguration.classConfiguration.getMethodType(method.name),
            params: params
          };
          return methodInfo;
        }
      );

      const classInfo: AstSummaryClass = {
        name: classElem.name,
        path: classConfiguration.classConfiguration.path,
        methods: methods
      };
      return classInfo;
    });

  return classes;
}
