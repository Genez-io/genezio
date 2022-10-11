import { Remote } from "./remote.js"

export class HelloWorldClass {
    static remote = new Remote("https://f272blxylhrd5jylusswmsurhe0btvkh.lambda-url.us-east-1.on.aws/", 443)

    static async helloWorld() {
        return HelloWorldClass.remote.call("HelloWorldClass.helloWorld")  
    }
    
    static async hello(name, location) {
        return HelloWorldClass.remote.call("HelloWorldClass.hello", name, location)  
    }

    
}

export { Remote };
