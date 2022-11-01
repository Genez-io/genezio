export default class Handler {
  path: string;
  object: any;
  className: string;
  functionNames: string[];
  methodsMap: any;

  constructor(
    path: string,
    object: any,
    className: string,
    functionNames: string[],
    methodsMap: any
  ) {
    this.path = path;
    this.object = object;
    this.className = className;
    this.functionNames = functionNames;
    this.methodsMap = methodsMap;
  }
}
