import { Remote } from "./remote.js"


export class HelloWorld {
    static remote = new Remote("https://t6maexr7yzdj4rrowcx6xv6k2y0hxrrs.lambda-url.us-east-1.on.aws/")

    static async helloWorld() {
        return HelloWorld.remote.call("HelloWorld.helloWorld")
    }
      
    static async hello(name: string, from: string): Promise<string> {
        return HelloWorld.remote.call("HelloWorld.hello", name, from)  
    }
  
    
}

export { Remote };
