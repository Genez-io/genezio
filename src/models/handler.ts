export default class Handler {
  path: string;
  object: any;
  className: string;
  functionNames: string[];

  constructor(
    path: string,
    object: any,
    className: string,
    functionNames: string[]
  ) {
    this.path = path;
    this.object = object;
    this.className = className;
    this.functionNames = functionNames;
  }
}
