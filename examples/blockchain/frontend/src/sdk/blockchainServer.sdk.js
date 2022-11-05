import { Remote } from "./remote.js"

export class BlockchainServer {
    static remote = new Remote("https://whemjpazj4jvvtgcjnrmfamrwa0qaoft.lambda-url.us-east-1.on.aws/")

    static async getEvents(from, limit) {
        return BlockchainServer.remote.call("BlockchainServer.getEvents", from, limit)  
    }

    
}

export { Remote };
