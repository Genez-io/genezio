
export class HelloWorld {
    constructor() {
        console.log("Constructor called!")
    }

    helloWorld() {
        return "Hello world!";
      }
    
      hello(name: string, from: string): string {
        const message = `Hello, ${name}, from ${from}`;
        console.log(message)

        return message
      }
}