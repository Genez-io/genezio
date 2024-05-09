/* eslint-disable no-useless-escape */

export const genezioRuntimeHandlerGenerator = (className: string): string => `
/** This is an auto generated code. This code should not be modified since the file can be overwritten
 *  if new genezio commands are executed.
 */

import {  ${className.replace(/["]/g, "")} as genezioClass } from "./module.mjs";

var handler = undefined;
var constructorTimeMilli = undefined;

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
            headers: { 'Content-Type': 'application/json', 'X-Powered-By': 'genezio' }
        };
    };
} else {
    const sendError = async function (err) {
        // Not implemented
    };

    let object;
    let startTime = new Date();
    try {
        object = new genezioClass();
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
                headers: { 'Content-Type': 'application/json', 'X-Powered-By': 'genezio' }
            };
        };
    }
    constructorTimeMilli = new Date() - startTime;

    handler = handler ?? async function (event) {
        if (event.http && event.http.method === "OPTIONS") {
            const response = {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json', 'X-Powered-By': 'genezio' }
            };
            return response;
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
            if (!components[2]) {
                return {
                    statusCode: 404,
                    headers: { 'Content-Type': 'application/json', 'X-Powered-By': 'genezio' },
                    body: JSON.stringify({ error: "Method not found" }),
                };
            }

            const method = components[2];

            const http2CompliantHeaders = {};
            for (const header in event.headers) {
                http2CompliantHeaders[header.toLowerCase()] = event.headers[header];
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
                    headers: { "Content-Type": "text/json", 'X-Powered-By': 'genezio' },
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
                    headers: { "Content-Type": "application/json", 'X-Powered-By': 'genezio' },
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
                    headers: { 'Content-Type': 'application/json', 'X-Powered-By': 'genezio' }
                };
            }

            if (('Genezio-Event' in event.headers) && event.headers['Genezio-Event'] === 'cron') {
                console.log(
                    "DEBUG: trigger cron: " + event.headers['Genezio-CronString'] + " on method: " + body.method
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
                    headers: { 'Content-Type': 'application/json', 'X-Powered-By': 'genezio' }
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
                    headers: { 'Content-Type': 'application/json', 'X-Powered-By': 'genezio' }
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
                            error: { code: -1, message: err.toString() },
                            id: requestId,
                        }),
                        headers: { 'Content-Type': 'application/json', 'X-Powered-By': 'genezio' }
                    });
                });
            });

            if(body.params && body.params.length > 0 && body.params[0].isGnzContext === true ) {
                body.params[0].requestContext = event.requestContext;
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
                            headers: { 'Content-Type': 'application/json', 'X-Powered-By': 'genezio' }
                        };
                    })
                    .catch(async (err) => {
                        console.error(err);
                        await sendError(err);
                        return {
                            statusCode: 500,
                            body: JSON.stringify({
                                jsonrpc: "2.0",
                                error: { code: -1, message: err.toString() },
                                id: requestId,
                            }),
                            headers: { 'Content-Type': 'application/json', 'X-Powered-By': 'genezio' }
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
                        error: { code: -1, message: err.toString() },
                        id: requestId,
                    }),
                    headers: { 'Content-Type': 'application/json', 'X-Powered-By': 'genezio' }
                };
            }
        }
    }
}

export { handler, constructorTimeMilli };
`;
