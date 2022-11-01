export default class Handler {
  path: string;
  object: any;
  className: string;

  constructor(path: string, object: any, className: string) {
    this.path = path;
    this.object = object;
    this.className = className;
  }
}
