import { Remote } from "./remote.js"

export class HelloWorldCronExample {
    static remote = new Remote("https://wrxgock6c56i42mcokwshyptom0ivins.lambda-url.us-east-1.on.aws/", 443)

    static async helloWorld(name) {
        return HelloWorldCronExample.remote.call("HelloWorldCronExample.helloWorld", name)  
    }

    
}

export { Remote };
