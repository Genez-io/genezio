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

http.createServer = function(requestListener) {
  // Wrap the request listener (Express app handler) in a domain
  const customHandler = (req, res) => {
    const operationId = process.domain ? process.domain.operationId : "unknown";
    const reqDomain = domain.create();

    reqDomain.operationId = operationId;
    reqDomain.on("error", err => {
      console.error(err);
      try {
      console.log('Sending 500 response');
        res.statusCode = 500;
        res.end("Internal Server Error");
      } catch (err) {
        console.error("Error sending 500 response:", err);
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


async function getData(event) {
  return new Promise((resolve) => {
    const headers = {};
    let statusCode = 200;
    let body = '';
    const res = new http.ServerResponse(event);

    res.writeHead = (status, headers) => {
      statusCode = status;
      headers = headers;
    }

    res.write = data => {
      body += data;
    }

    res.end = data => {
      body += data;
      resolve({ statusCode, headers, body });
    }

    res.status = status => {
      statusCode = status;
    }

    res.setHeader = (name, value) => {
      headers[name] = value;
    }

    res.send = data => {
      body = data;
      resolve({ statusCode, headers, body });
    }

    // handler res error
    res.on("error", err => {
      console.error("Response error:", err);
      resolve({ statusCode: 500, headers, body: "Internal server error" });
    });

    const req = new http.IncomingMessage();
    req.method = event.http.method;
    req.url = \`\${event.http.path}\${event.url.search}\`;
    req.headers = event.headers;
    req.body = event.body.toString();

    myHandler(req, res);
  }).catch((error) => {
    console.error(error);
    throw error;
  });
}

const handler = async function(event) {

  const timeStartBefore = new Date();

  try {
    const response = await getData(event);

    const timeEndAfter = new Date();


    // Return the appropriate response in the AWS Lambda format
    return {
      statusCode: response.statusCode,
      headers: response.headers,
      body: response.body,
    };
  } catch (error) {
    // Handle errors
    console.error(error);
    return {
      statusCode: 500,
      headers: {},
      body: error.message,
    };
  }
  
};

export { handler };`;

        await writeToFile(outputPath, handlerFileName, handlerContent);
    }
}
