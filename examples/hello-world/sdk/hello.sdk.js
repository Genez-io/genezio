import { Env, Remote } from "./remote.js"

export class HelloWorldClass {
    static remote = new Remote("https://m6fedlm7t3bluyyxjjjhimsizi0vlelm.lambda-url.us-east-1.on.aws/")

    static async helloWorld() {
        return HelloWorldClass.remote.call("HelloWorldClass.helloWorld")  
    }
    
    static async hello(name, location) {
        return HelloWorldClass.remote.call("HelloWorldClass.hello", name, location)  
    }

    
}

export { Env, Remote };
