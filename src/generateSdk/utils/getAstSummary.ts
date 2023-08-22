import { AstSummaryClass, AstSummaryMethod, AstSummaryParam } from "../../models/astSummary.js";
import {
  ClassDefinition,
  MethodDefinition,
  Node,
  ParameterDefinition,
  SdkGeneratorClassesInfoInput
} from "../../models/genezioModels.js";



export function getAstSummary(
  classesInfo: SdkGeneratorClassesInfoInput[]
): AstSummaryClass[] {
  const classes: AstSummaryClass[] = classesInfo
    .filter((classConfiguration: SdkGeneratorClassesInfoInput) => {
      const body: (ClassDefinition | Node)[] | undefined =
        classConfiguration.program.body;
      // filter if body is undefined
      if (body === undefined) {
        return false;
      }
      return true;
    })
    .map((classConfiguration: SdkGeneratorClassesInfoInput) => {
      const body: (ClassDefinition | Node)[] | undefined =
        classConfiguration.program.body;

      // get the class definition
      const classElem: ClassDefinition = body?.find((elem) => {
        return elem.type === "ClassDefinition";
      }) as ClassDefinition;

      // get the types
      const types: Object[] = body?.filter((elem) => {
        return elem.type !== "ClassDefinition";
      }).map((elem) => {
        return elem;
      }) || [];

      const methods: AstSummaryMethod[] = classElem.methods.map(
        (method: MethodDefinition) => {
          const params: AstSummaryParam[] = method.params.map(
            (param: ParameterDefinition) => {
              return {
                name: param.name,
                type: param.paramType,
                optional: param.optional
              };
            }
          );

          const methodInfo: AstSummaryMethod = {
            name: method.name,
            type: classConfiguration.classConfiguration.getMethodType(method.name),
            params: params,
            returnType: method.returnType
          };
          return methodInfo;
        }
      );

      const classInfo: AstSummaryClass = {
        name: classElem.name,
        path: classConfiguration.classConfiguration.path,
        language: classConfiguration.classConfiguration.language,
        methods: methods,
        types: types
      };
      return classInfo;
    });
  return classes;
}
