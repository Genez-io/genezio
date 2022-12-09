//const object = new handler.genezio[Object.keys(handler.genezio)[0]]();

export const lambdaHandler = (className: string): string => `
const handler = require("./module.js");

const object = new handler.genezio[${className}]();

exports.handler =  async function(event, context) {
    if (event.genezioEventType === "cron") {

        const method = event.methodName;

        console.log("DEBUG: trigger cron: " + event.cronString + " on method: " + method)

        try {
          await object[method]();
        } catch(error) {
          console.log("ERROR: cron trigger with error: " + error);
        }
        return;
    }
    if (event.requestContext.http.path.split("/").length > 2) {
        const method = event.requestContext.http.path.split("/")[2]
        const req = {
            headers: event.headers,
            http: event.requestContext.http,
            queryParameters: event.queryStringParameters,
            timeEpoch: event.requestContext.timeEpoch,
            body: event.body
          }
        if (!object[method]) {
          return { statusCode: 404, headers: { 'Content-Type': 'text/json' }, body: JSON.stringify({ error: "Method not found" }) };
        }

        try {
            const response = await object[method](req);
            return response;
        } catch(error) {
            console.error(error);
            return { statusCode: 500, headers: { 'Content-Type': 'text/json' }};
        }
    } else {
        let body = null;
        try {
          body = JSON.parse(event.body);
        } catch (error) {
          return { statusCode: 400, headers: { 'Content-Type': 'text/json' }, body: JSON.stringify({ error: "Invalid JSON" }) };
        }
        if (!body || !body.method || !body.params || !body.id) {
          return { statusCode: 400, headers: { 'Content-Type': 'text/json' }, body: JSON.stringify({ error: "Invalid JSON-RPC 2.0 request" }) };
        }

        let method = null;
        try {
          const methodElems = body.method.split(".");
          method = methodElems[1];
        } catch (error) {
          return { statusCode: 400, headers: { 'Content-Type': 'text/json' }, body: JSON.stringify({ error: "Invalid JSON-RPC 2.0 request" }) };
        }

        if (!object[method]) {
          return { statusCode: 404, headers: { 'Content-Type': 'text/json' }, body: JSON.stringify({ error: "Method not found" }) };
        }



        const requestId = body.id;
        try {
          const response = await object[method](...(body.params || []));
          return {"jsonrpc": "2.0", "result": response, "error": null, "id": requestId};
        } catch(error) {
          return {"jsonrpc": "2.0", "error": {"code": -1, "message": error.toString()}, "id": requestId};
        }
    }
}
`;
