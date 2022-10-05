
export class HelloWorldClass {
    constructor() {
        console.log("hey!")
    }

    helloWorld() {
        return "Hello world!";
    }

    hello(name, location) {
        return `Hello, ${name}! Greetings from ${location}!`
    }
}
