import { Remote } from "./remote.js"

export class HelloWorldCronExample {
    static remote = new Remote("http://127.0.0.1:8083/HelloWorldCronExample", 8083)

    static async helloWorld(name) {
        return HelloWorldCronExample.remote.call("HelloWorldCronExample.helloWorld", name)  
    }

    
}

export { Remote };
