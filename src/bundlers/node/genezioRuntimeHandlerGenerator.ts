/* eslint-disable no-useless-escape */

export const genezioRuntimeHandlerGenerator = (className: string): string => `
/** This is an auto generated code. This code should not be modified since the file can be overwritten
 *  if new genezio commands are executed.
 */

import {  ${className.replace(/["]/g, "")} as genezioClass } from "./module.mjs";

var handler = undefined;

function prepareForSerialization(e) {
    if (e instanceof Error) {
        const object = { message: e.message, stack: e.stack, info: e.info, code: e.code } 
        return object;
    }
    console.error(\`Unsupported error type \${typeof e}\`)
    return { message: "Unknown error occurred. Check logs for more information!" }
}

if (!genezioClass) {
    console.error(
        'Error! No class found with name ${className}. Make sure you exported it from your file.'
    );
    handler = async function (event) {
        return {
            statusCode: 500,
            body: JSON.stringify({
                jsonrpc: "2.0",
                error: {
                    code: -1,
                    message:
                        'Error! No class found with name ${className}. Make sure you exported it from your file.',
                },
                id: 0,
            }),
            headers: { 'Content-Type': 'application/json', 'X-Powered-By': 'genezio','Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' }
        };
    };
} else {
    const sendError = async function (err) {
        // Not implemented
    };

    let object;

    handler ??= async function (event) {
        if (event.http && event.http.method === "OPTIONS") {
            const response = {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json', 'X-Powered-By': 'genezio', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' },
            };
            return response;
        }

        try {
            object ??= new genezioClass();
        } catch (error) {
            handler = async function (event) {
                await sendError(error);
                return {
                    statusCode: 500,
                    body: JSON.stringify({
                        jsonrpc: "2.0",
                        error: {
                            code: -1,
                            message: \`Constructor call failure: \$\{error.message\}\`
                        },
                        id: 0,
                    }),
                    headers: { 'Content-Type': 'application/json', 'X-Powered-By': 'genezio','Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' }
                };
            };
        }

        let body = event.body;
        let invalidBody = false;
        try {
            body = JSON.parse(event.body);
        } catch (error) {
            invalidBody = true;
        }

        if (!body || (body && body["jsonrpc"] !== "2.0")) {
            // For raw http calls, paths should match \`/funcId/className/methodName\`
            const components = event.http.path.substring(1).split("/");
            if (!components[1]) {
                return {
                    statusCode: 404,
                    headers: { 'Content-Type': 'application/json', 'X-Powered-By': 'genezio', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*'},
                    body: JSON.stringify({ error: "Method not found" }),
                };
            }

            const method = components[1];

            const http2CompliantHeaders = {};
            for (const header in event.headers) {
                http2CompliantHeaders[header.toLowerCase()] = event.headers[header];
                http2CompliantHeaders['Access-Control-Allow-Origin'.toLowerCase()] = '*';
                http2CompliantHeaders['Access-Control-Allow-Headers'.toLowerCase()] = '*';
                http2CompliantHeaders['Access-Control-Allow-Methods'.toLowerCase()] = '*';
            }

            const req = {
                headers: http2CompliantHeaders,
                http: event.http,
                queryStringParameters: Object.fromEntries([...event.url.searchParams]),
                timeEpoch: event.requestTimestampMs,
                body: event.isBase64Encoded ? Buffer.from(body, "base64") : body,
                rawBody: event.body,
            };

            if (!object[method]) {
                return {
                    statusCode: 404,
                    headers: { "Content-Type": "text/json", 'X-Powered-By': 'genezio','Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' },
                    body: JSON.stringify({ error: "Method not found" }),
                };
            }

            try {
                const response = await object[method](req);

                if (!response.statusCode) {
                    response.statusCode = 200;
                }

                if (response.body instanceof Buffer) {
                    response.body = response.body.toString("base64");

                    return {
                        ...response,
                        isBase64Encoded: true,
                    };
                } else if (response.body instanceof Object) {
                    try {
                        response.body = JSON.stringify(response.body);
                    } catch (error) { }
                }

                return response;
            } catch (error) {
                console.error(error);
                return {
                    statusCode: 500,
                    body: JSON.stringify({ error: error.message }),
                    headers: { "Content-Type": "application/json", 'X-Powered-By': 'genezio','Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' },
                };
            }
        } else {
            if (invalidBody || !body || !body.method || !body.params || !Number.isInteger(body.id)) {
                return {
                    statusCode: 500,
                    body: JSON.stringify({
                        jsonrpc: "2.0",
                        error: { code: -1, message: "Invalid JSON-RPC request" },
                        id: 0,
                    }),
                    headers: { 'Content-Type': 'application/json', 'X-Powered-By': 'genezio','Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' }
                };
            }

            if (('Genezio-Event' in event.headers) && event.headers['Genezio-Event'] === 'cron') {
                console.log(
                    "DEBUG: trigger cron: " + event.headers['Genezio-Cronstring'] + " on method: " + body.method
                );
            }

            let method = null;
            try {
                const methodElems = body.method.split(".");
                method = methodElems[1];
            } catch (error) {
                return {
                    statusCode: 500,
                    body: JSON.stringify({
                        jsonrpc: "2.0",
                        error: { code: -1, message: "Invalid Genezio JSON-RPC request" },
                        id: 0,
                    }),
                    headers: { 'Content-Type': 'application/json', 'X-Powered-By': 'genezio','Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' }
                };
            }

            if (!object[method]) {
                return {
                    statusCode: 500,
                    body: JSON.stringify({
                        jsonrpc: "2.0",
                        error: { code: -1, message: "Method not found!" },
                        id: 0,
                    }),
                    headers: { 'Content-Type': 'application/json', 'X-Powered-By': 'genezio','Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' }
                };
            }

            const requestId = body.id;
            const errorPromise = new Promise((resolve) => {
                process.removeAllListeners("uncaughtException");
                process.on("uncaughtException", async function (err) {
                    console.error(err);
                    await sendError(err);
                    resolve({
                        statusCode: 500,
                        body: JSON.stringify({
                            jsonrpc: "2.0",
                            error: prepareForSerialization(err),
                            id: requestId,
                        }),
                        headers: { 'Content-Type': 'application/json', 'X-Powered-By': 'genezio','Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' }
                    });
                });
            });

            if(body.params && body.params.length > 0 && body.params[0] && body.params[0].isGnzContext === true ) {
                body.params[0].requestContext = {
                    http: event.http,
                    url: event.url, 
                };
                body.params[0].headers = event.headers;
            }
            try {
                const response = Promise.resolve(object[method](...(body.params || [])))
                    .then((result) => {
                        return {
                            statusCode: 200,
                            body: JSON.stringify({
                                jsonrpc: "2.0",
                                result: result,
                                error: null,
                                id: requestId,
                            }),
                            headers: { 'Content-Type': 'application/json', 'X-Powered-By': 'genezio','Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' }
                        };
                    })
                    .catch(async (err) => {
                        console.error(err);
                        await sendError(err);
                        return {
                            statusCode: 500,
                            body: JSON.stringify({
                                jsonrpc: "2.0",
                                error: prepareForSerialization(err),
                                id: requestId,
                            }),
                            headers: { 'Content-Type': 'application/json', 'X-Powered-By': 'genezio','Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' }
                        };
                    });

                const result = await Promise.race([errorPromise, response]);
                return result;
            } catch (err) {
                console.error(err);
                await sendError(err);
                return {
                    statusCode: 500,
                    body: JSON.stringify({
                        jsonrpc: "2.0",
                        error: prepareForSerialization(err),
                        id: requestId,
                    }),
                    headers: { 'Content-Type': 'application/json', 'X-Powered-By': 'genezio','Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' }
                };
            }
        }
    }
}

export { handler };
`;
