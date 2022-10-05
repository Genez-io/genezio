import { bundleJavascriptCode } from "./commands"
import http from 'http'
import Handler from "./models/handler"
import { readUTF8File } from "./utils/file"
import { parse } from "yaml"

export default class Server {
    async generateHandlersFromFiles(): Promise<Handler[]> {
        const handlers: Handler[] = []
        const configurationFileContentUTF8 = await readUTF8File('./genezio.yaml')
        const configurationFileContent = await parse(configurationFileContentUTF8);

        for (const file of configurationFileContent.classPaths) {
            const { path, className, functionNames } = await bundleJavascriptCode(file)

            const module = require(path)
            const object = new module.genezio[className]()
            functionNames.forEach((functionName) => {
                handlers.push(new Handler(path, object, className, functionName))
            });
        }

        return handlers
    }

    async start(handlers: Handler[]) {
        if (handlers.length === 0) {
            console.log("No class registered. Make sure that you have set the classes that you want to deploy in the genezio.yaml configuration file.")
            return;
        }

        const requestListener = async function (request: http.IncomingMessage, response: http.ServerResponse) {
            var body = ''
            if (request.method === "OPTIONS") {
                response.setHeader('Access-Control-Allow-Origin', '*');
                response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
                response.setHeader('Access-Control-Allow-Methods', 'POST');
                response.end();
                return;
            }

            request.on('data', function (data) {
                body += data
            })

            request.on('end', async function () {
                const jsonRpcRequest: any = JSON.parse(body);
                const components = jsonRpcRequest.method.split(".");

                if (components.length !== 2) {
                    response.writeHead(404);
                    const responseData = { "jsonrpc": "2.0", "error": { "code": -32601, "message": "Wrong method format" }, "id": jsonRpcRequest.id }
                    response.end(responseData);
                    return;
                }

                const [ className, method ] = components

                console.log(`Receive call on function ${jsonRpcRequest.method}`)
                const handler = handlers.find((handler) =>
                    handler.className === className &&
                    handler.functionName === method
                )

                if (!handler) {
                    response.writeHead(404);
                    const responseData = { "jsonrpc": "2.0", "error": { "code": -32601, "message": "Method not found" }, "id": jsonRpcRequest.id }
                    response.end(responseData);
                    return;
                }

                let functionName = handler.functionName
                let responseData = undefined

                try {
                    const functionResponse = await handler.object[functionName](...jsonRpcRequest.params);
                    responseData = { "jsonrpc": "2.0", "result": functionResponse, "error": null, "id": jsonRpcRequest.id };
                } catch (error: any) {
                    console.error("An error occured:", error.toString())
                    responseData = { "jsonrpc": "2.0", "error": { "code": -1, "message": error.toString() }, "id": jsonRpcRequest.id }
                }

                response.setHeader('Access-Control-Allow-Origin', '*');
                response.setHeader('Access-Control-Allow-Headers', 'Content-Type'); 
                response.setHeader('Access-Control-Allow-Methods', 'POST');
                response.writeHead(200);
                response.end(JSON.stringify(responseData));
            })
        }

        const server = http.createServer(requestListener);

        console.log('Functions registered:')
        handlers.forEach((handler) => {
            console.log(`  - ${handler.className}.${handler.functionName}`)
        })
        console.log('')
        console.log('Listening for requests...')
        server.listen(8083);
    }
}
