import { Remote } from "./remote.js"


export class HelloWorld {
    static remote = new Remote("http://127.0.0.1:8083/HelloWorld")

    static async helloWorld() {
        return HelloWorld.remote.call("HelloWorld.helloWorld")
    }
      
    static async hello(name: string, from: string): Promise<string> {
        return HelloWorld.remote.call("HelloWorld.hello", name, from)  
    }
  
    
}

export { Remote };
