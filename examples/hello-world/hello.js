
export class HelloWorldClass {
    constructor() {
        console.log("hey!")
    }

    helloWorld() {
        return "Hello world!";
    }

    hello(name, location) {
        return `Hey, ${name}! Greetings from ${location}!`
    }
}
