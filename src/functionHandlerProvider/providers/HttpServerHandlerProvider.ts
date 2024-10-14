import { writeToFile } from "../../utils/file.js";
import { FunctionConfiguration } from "../../models/projectConfiguration.js";
import { FunctionHandlerProvider } from "../functionHandlerProvider.js";

export class HttpServerHandlerProvider implements FunctionHandlerProvider {
    async write(
        outputPath: string,
        handlerFileName: string,
        functionConfiguration: FunctionConfiguration,
    ): Promise<void> {
        const handlerContent = `
import * as domain from "domain";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const http = require('http')

const originalCreateServer = http.createServer;
let myHandler;

http.createServer = function(options, requestListener) {
    if (typeof options === 'function') {
      requestListener = options;
      options = {};
    }

    // If options is not an object, set it to an empty object
    options = options || {};
  // Wrap the request listener (Express app handler) in a domain
  const customHandler = (req, res) => {
    const operationId = process.domain ? process.domain.operationId : "unknown";
    const reqDomain = domain.create();

    reqDomain.operationId = operationId;
    reqDomain.on("error", err => {
      console.error(err);
      try {
        res.statusCode = 500;
        res.end(err.toString());
      } catch (err) {
        console.error("Error:", err);
      }
    });

    reqDomain.run(() => {
      requestListener(req, res); // Call the original request listener (Express app)
    });
  };

  myHandler = customHandler;

  return originalCreateServer(myHandler);
};

// Import the original app.js, but it will automatically start the server
const app = await import("./${functionConfiguration.entry}");


async function getData(event, responseStream) {
  return new Promise(async (resolve) => {
    const headers = {};
    let statusCode = 200;
    let body = '';
    const res = new http.ServerResponse(event);

    res.writeHead = (status, headersLocal) => {
        event.responseStream.writeHead(status, headersLocal);
    }

    res.write = data => {
        event.responseStream.write(data);
        console.log('res.write', data)
    }

    res.end = data => {
        event.responseStream.end(data);
        console.log('res.end', data)
    }

    res.status = status => {
        event.responseStream.status(status);
        console.log('res.status', status)
    }

    res.setHeader = (name, value) => {
        console.log('res.setHeader', name, value)
        event.responseStream.setHeader(name, value);
    }

    res.send = data => {
        console.log('res.send', statusCode, headers, body)
        event.responseStream.send(data);
    }

    const req = new http.IncomingMessage();
    req.method = event.http.method;
    req.url = \`\${event.http.path}\${event.url.search}\`;
    req.headers = event.headers;
    req.body = event.body.toString();

    await myHandler(req, res);
  }).catch((error) => {
    console.error(error);
    throw error;
  });
}

const handler = async function(event) {
  await getData(event);
};

export { handler };`;

        await writeToFile(outputPath, handlerFileName, handlerContent);
    }
}
