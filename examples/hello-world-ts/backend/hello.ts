export enum Season {
  Winter = "Winter",
  Summer = "Summer"
}

export class HelloWorld {

  constructor() {
    console.log("Constructor called!")
  }

  helloWorld() {
    return "Hello world!";
  }

  hello(name: string, from: string, value: Season): string {
    const message = `Hello, ${name}, from ${from} during this ${value}`;
    console.log(message)

    return message
  }
}