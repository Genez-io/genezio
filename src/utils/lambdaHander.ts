export const lambdaHandler = `
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
`