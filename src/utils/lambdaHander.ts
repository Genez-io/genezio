export const lambdaHandlerJsonRpc = `
  const handler = require("./module.js");    

  const object = new handler.genezio[Object.keys(handler.genezio)[0]]();
  
  exports.handler =  async function(event, context) {
      const body = JSON.parse(event.body);
      const [_, method] = body.method.split(".")
  
      const requestId = body.id;
      try {
          const response = await object[method](...(body.params || []));
          return {"jsonrpc": "2.0", "result": response, "error": null, "id": requestId};
      } catch(error) {
          return {"jsonrpc": "2.0", "error": {"code": -1, "message": error.toString()}, "id": requestId};
      }
  }
`;

export const lambdaHandlerWebhook = `
  const handler = require("./module.js");    

  const object = new handler.genezio[Object.keys(handler.genezio)[0]]();

  exports.handler =  async function(event, context) {
      const method = event.requestContext.http.path.split("/")[1]

      const req = {
        headers: event.headers,
        http: event.requestContext.http,
        queryParameters: event.queryStringParameters,
        timeEpoch: event.requestContext.timeEpoch
      }

      try {
          const response = await object[method](req);
          return response;
      } catch(error) {
          return { statusCode: 500, headers: { 'Content-Type': 'text/json' }};
      }
  }
`;
