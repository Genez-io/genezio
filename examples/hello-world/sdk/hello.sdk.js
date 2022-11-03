import { Remote } from "./remote.js"

export class HelloWorldClass {
    static remote = new Remote("https://iqk4exnnzxosv6h6ivetlxsvoq0bqvlp.lambda-url.us-east-1.on.aws/", 443)

    static async helloWorld() {
        return HelloWorldClass.remote.call("HelloWorldClass.helloWorld")  
    }
    
    static async hello(reqToFunction) {
        return HelloWorldClass.remote.call("HelloWorldClass.hello", reqToFunction)  
    }

    
}

export { Remote };
