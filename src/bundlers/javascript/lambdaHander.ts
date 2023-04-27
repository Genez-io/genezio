//const object = new handler.genezio[Object.keys(handler.genezio)[0]]();
/* eslint-disable no-useless-escape */

export const lambdaHandler = (className: string): string => `
delete process.env.AWS_ACCESS_KEY_ID
delete process.env.AWS_SECRET_ACCESS_KEY
delete process.env.AWS_REGION
const handler = require("./module.js");

const genezioClass = handler.genezio[${className}];

if (!genezioClass) {
  console.error('Error! No class found with name ${className}. Make sure you exported it from your file.')
  exports.handler =  async function(event, context) {
    return {"jsonrpc": "2.0", "error": {"code": -1, "message": 'Error! No class found with name ${className}. Make sure you exported it from your file.'}, "id": 0};
  }
  return;
}

const object = new genezioClass();


exports.handler =  async function(event, context) {
    if (event.genezioEventType === "cron") {
        const method = event.methodName;

        if (!object[method]) {
          console.error(\`ERROR: Cron method named \$\{method\} does not exist.\`);
          return
        }

        console.log("DEBUG: trigger cron: " + event.cronString + " on method: " + method)

        try {
          await object[method]();
        } catch(error) {
          console.log("ERROR: cron trigger with error: " + error);
        }
        return;
    }

    if (event.requestContext.http.method === "OPTIONS") {
      const response = {
        statusCode: 200,
    };
      return response;
    }

    let body = event.body

    try {
      body = JSON.parse(event.body)
    } catch (error) {
    }

    const components = event.requestContext.http.path.split("/")
    if (!body || (body && body["jsonrpc"] !== "2.0")) {
        const method = components.slice(-1)
        const req = {
            headers: event.headers,
            http: event.requestContext.http,
            queryStringParameters: event.queryStringParameters,
            timeEpoch: event.requestContext.timeEpoch,
            body: event.isBase64Encoded ? Buffer.from(body, "base64") : body,
          }
        if (!object[method]) {
          return { statusCode: 404, headers: { 'Content-Type': 'text/json' }, body: JSON.stringify({ error: "Method not found" }) };
        }

        try {
            const response = await object[method](req);

            if (!response.statusCode) {
              response.statusCode = 200;
            }

            if (response.body instanceof Buffer) {
              response.body = response.body.toString('base64')

              return {
                ...response,
                isBase64Encoded: true,
              }
            } else if (response.body instanceof Object) {
              try {
                response.body = JSON.stringify(response.body)
              } catch (error) {}
            }

            return response;
        } catch(error) {
            console.error(error);
            return { statusCode: 500, body: JSON.stringify({"error": error.message}), headers: { 'Content-Type': 'application/json' }};
        }
    } else {
        let body = null;
        try {
          body = JSON.parse(event.body);
        } catch (error) {
          return {"jsonrpc": "2.0", "error": {"code": -1, "message": "Invalid JSON-RPC request"}, "id": 0}
        }
        if (!body || !body.method || !body.params || !Number.isInteger(body.id)) {
          return {"jsonrpc": "2.0", "error": {"code": -1, "message": "Invalid JSON-RPC request"}, "id": 0}
        }

        let method = null;
        try {
          const methodElems = body.method.split(".");
          method = methodElems[1];
        } catch (error) {
          return {"jsonrpc": "2.0", "error": {"code": -1, "message": "Invalid Genezio JSON-RPC request"}, "id": 0}
        }

        if (!object[method]) {
          return {"jsonrpc": "2.0", "error": {"code": -1, "message": "Method not found!"}, "id": 0}
        }

        const requestId = body.id;
        const errorPromise = new Promise((resolve) => {
          process.on('uncaughtException', function(err) {
            resolve({"jsonrpc": "2.0", "error": {"code": -1, "message": err.toString()}, "id": requestId})
          });
        })

        try {
          const response = Promise.resolve(object[method](...(body.params || []))).then((result) => {
            return {"jsonrpc": "2.0", "result": result, "error": null, "id": requestId};
          }).catch((err) => {
            return {"jsonrpc": "2.0", "error": {"code": -1, "message": err.toString()}, "id": requestId}
          })

          const result = await Promise.race([errorPromise, response])
          process.removeAllListeners("uncaughtException")
          return result
        } catch (err) {
          return {"jsonrpc": "2.0", "error": {"code": -1, "message": err.toString()}, "id": requestId}
        }
    }
}
`;
