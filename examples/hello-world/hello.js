export class HelloWorldClass {
  constructor() {
    console.log("hey!");
  }

  helloWorld() {
    return "Hello world!";
  }

  hello(reqToFunction) {
    return { body: "content", status: "200" };
  }
}
