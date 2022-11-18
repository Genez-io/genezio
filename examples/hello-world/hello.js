export class HelloWorldClass {
  constructor() {
    console.log("Constructor called!");
  }

  helloWorld() {
    return "Hello world!";
  }

  hello(name, from) {
    return `Hello, ${name}, from ${from}!`;
  }
}
