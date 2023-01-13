import Web3 from "web3"
import { abi } from "./abi.js";
import { EventModel } from "./models/event.js"
import { mongoose } from "mongoose";
import { MONGO_DB_URI, CONTRACT_ADDRESS, BWARE_URL } from "./config.js";


/**
 * The Blockchain server class that will be deployed on the genezio infrastructure.
 */
export class BlockchainServer {

    constructor() {
        mongoose.connect(MONGO_DB_URI);
        this.web3 = new Web3(BWARE_URL);
        this.contract = new this.web3.eth.Contract(JSON.parse(abi), CONTRACT_ADDRESS);
        this.knownEventTokens = this.contract.options.jsonInterface.filter((token) => {
            return token.type === 'event';
        });
    }

    /**
     * Private method that decodes an event and returns the name and the parameters.
     * 
     * This will not be callable using the genezio SDK. Only the public methods are exposed publicly.
     * 
     * @param {*} event 
     * @returns An object containing the name of the event and its parameters.
     */
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
     * 
     * The method will be part of the SDK.
     * 
     * @param {*} from The starting index of the first event.
     * @param {*} limit The number of events that will be part of the response.
     * @returns 
     */
    async getEvents(from, limit) {
        console.log(`Received getEvents request with from = ${from} limit = ${limit}`)
        const count = await EventModel.count()
        const events = await EventModel.find(undefined, undefined, { skip: from, limit, sort: { "blockNumber": -1, "logIndex": -1 } })

        return {
            count,
            "events": events.map((event) => ({ id: event.id, name: event.name, parameters: event.parameters, blockNumber: event.blockNumber }))
        }
    }

    /**
     * Method that will be called periodically by the genezio infrastructure to index the events.
     * 
     * The frequency with which the method will be called can be modified from the genezio YAML file.
     * 
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
