import { Remote } from "./remote.js"

export class BlockchainServer {
    static remote = new Remote("https://udo2j4oyhrykxd6b2j2dx3pari0eours.lambda-url.us-east-1.on.aws/")

    static async getEvents(from, limit) {
        return BlockchainServer.remote.call("BlockchainServer.getEvents", from, limit)  
    }

    
}

export { Remote };
