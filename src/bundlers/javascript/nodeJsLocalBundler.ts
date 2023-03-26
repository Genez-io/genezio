import { writeToFile } from "../../utils/file";
import { BundlerInput, BundlerInterface, BundlerOutput } from "../bundler.interface";

// This file is the wrapper that is used to run the user's code in a separate process.
// It listens for messages from the parent process and runs the user's code when it receives a message.
const localWrapperCode = `
const userHandler = require("./index.js")

process.on('message', (msg) => {
    const json = JSON.parse(msg)
    userHandler.handler(json).then((response) => {
        process.send(JSON.stringify({ id: json.id, response: response }))
    })
})

function wait() {
    setTimeout(wait, 1000);
}

wait()
`

// Adds a wrapper to the user's code that allows it to be run in a separate process.
export class NodeJsLocalBundler implements BundlerInterface {
    async bundle(input: BundlerInput): Promise<BundlerOutput> {
        await writeToFile(input.path, "local.js", localWrapperCode, true)

        return input
    }
}