import { writeToFile } from "../../utils/file";
import { BundlerInput, BundlerInterface, BundlerOutput } from "../bundler.interface";

const test = `
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

export class NodeJsLocalBundler implements BundlerInterface {
    async bundle(input: BundlerInput): Promise<BundlerOutput> {
        await writeToFile(input.path, "local.js", test, true)

        return input
    }
}