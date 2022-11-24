import Web3 from "web3"
import { abi } from "./abi.js";
import { EventModel } from "./models/event.js"
import { mongoose } from "mongoose";


// Replace these with your own values.
const MONGO_DB_URI = "mongodb+srv://genezio:genezio@cluster0.c6qmwnq.mongodb.net/?retryWrites=true&w=majority"
const CONTRACT_ADDRESS = "0x942BC2d3e7a589FE5bd4A5C6eF9727DFd82F5C8a"
const BWARE_URL = "https://eth-mainnet.blastapi.io/23450296-544f-4ccc-a438-7cf90659b49e"


export class BlockchainServer {

    constructor() {
        mongoose.connect(MONGO_DB_URI);
        this.web3 = new Web3(BWARE_URL);
        this.contract = new this.web3.eth.Contract(JSON.parse(abi), CONTRACT_ADDRESS);
        this.knownEventTokens = this.contract.options.jsonInterface.filter((token) => {
            return token.type === 'event';
        });
    }

    #decodeEvent(event) {
        // Retrieve the event declaration from the ABI
        const eventToken = this.knownEventTokens.find((knownEventToken) => {
            return knownEventToken.signature === event.topics[0];
        });
        if (!eventToken) {
            console.log('cannot process log %d', event.logIndex);

            return undefined;
        }

        // Decode the event
        const decodedEvent = this.web3.eth.abi.decodeLog(
            eventToken.inputs,
            event.data,
            event.topics.slice(1),
        )

        // Parse the parameters in a simple dictionary
        const parameters = {}
        eventToken.inputs.forEach((input) => {
            parameters[input.name] = decodedEvent[input.name]
        })

        return {
            name: eventToken.name,
            parameters,
        }
    }

    /**
     * Method used to get all the events in a paginated way.
     */
    async getEvents(from, limit) {
        const count = await EventModel.count()
        const events = await EventModel.find(undefined, undefined, { skip: from, limit, sort: { "blockNumber": -1, "logIndex": -1 } })

        return {
            count,
            "events": events.map((event) => ({ id: event.id, name: event.name, parameters: event.parameters, blockNumber: event.blockNumber }))
        }
    }

    /**
     * Method that will be called periodically to index the events.
     */
    async sync() {
        // Get the current block number and request the last 100 blocks
        const blockNumber = await this.web3.eth.getBlockNumber()
        let events = await this.web3.eth.getPastLogs({ address: CONTRACT_ADDRESS, fromBlock: blockNumber - 50, toBlock: blockNumber });

        console.log(`New sync started with ${events.length} to save`)

        for (const event of events) {
            const decodedEvent = this.#decodeEvent(event)

            if (!decodedEvent) {
                continue
            }

            // Insert the missing events.
            await EventModel.findOneAndUpdate({ id: `${event.transactionHash}-${event.logIndex}` }, {
                $setOnInsert: {
                    id: `${event.transactionHash}-${event.logIndex}`,
                    name: decodedEvent.name,
                    parameters: decodedEvent.parameters,
                    blockNumber: event.blockNumber,
                    logIndex: event.logIndex
                }
            }, { upsert: true });
        }
    }
}
