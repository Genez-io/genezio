import { Remote } from "./remote.js"

export class HelloWorldClass {
    static remote = new Remote("http://127.0.0.1:8083/HelloWorldClass")

    static async helloWorld() {
        return HelloWorldClass.remote.call("HelloWorldClass.helloWorld")  
    }
    
    static async hello(reqToFunction) {
        return HelloWorldClass.remote.call("HelloWorldClass.hello", reqToFunction)  
    }

    
}

export { Remote };
