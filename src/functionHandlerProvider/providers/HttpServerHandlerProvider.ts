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
let server;

http.createServer = function(...args) {
  server = originalCreateServer(...args); 
  return server
};

// Import the original app.js, but it will automatically start the server
const app = await import("./${functionConfiguration.entry}");


async function sendRequest(event) {
  return new Promise(async (resolve) => {
    const req = new http.IncomingMessage();
    req.method = event.http.method;
    req.url = \`\${event.http.path}\${event.url.search}\`;
    req.headers = event.headers;
    req.body = event.body.toString();
    req.connection = {
        remoteAddress: event.http.sourceIp
    }

    const res = new http.ServerResponse(req);

    res.writeHead = (status, headersLocal) => {
        event.responseStream.writeHead(status, headersLocal);
    }

    res.write = data => {
        event.responseStream.write(data);
    }

    res.end = data => {
        event.responseStream.end(data);
    }

    res.status = status => {
        event.responseStream.status(status);
    }

    res.setHeader = (name, value) => {
        event.responseStream.setHeader(name, value);
    }

    const operationId = process.domain ? process.domain.operationId : "unknown";
    const reqDomain = domain.create();

    reqDomain.operationId = operationId;
    reqDomain.on("error", err => {
      console.error(err);
      try {
        res.statusCode = 500;
        if (process.env.GENEZIO_DEBUG_MODE === "true") {
            res.end(err.toString());
        } else {
            res.end("Internal Server Error");
        }
      } catch (err) {
        console.error("Error:", err);
      }
    });

    reqDomain.run(() => {
      server.emit("request", req, res);
      req.emit("data", req.body);
      req.emit("end");
    });
  }).catch((error) => {
    console.error(error);
    throw error;
  });
}

const handler = async function(event) {
  await sendRequest(event);
};

export { handler };`;

        await writeToFile(outputPath, handlerFileName, handlerContent);
    }

    // NOT USED
    async getLocalFunctionWrapperCode(handler: string, entry: string): Promise<string> {
        return `${handler} ${entry}`;
    }
}

export class HttpServerPythonHandlerProvider implements FunctionHandlerProvider {
    async write(
        outputPath: string,
        handlerFileName: string,
        functionConfiguration: FunctionConfiguration,
    ): Promise<void> {
        const handlerContent = `
import os
from importlib import import_module
from http.server import BaseHTTPRequestHandler, HTTPServer
import threading
import asyncio

# Import the original app.py, but it will automatically start the server
app = import_module("${functionConfiguration.entry.split(".")[0]}")

server = None
original_create_server = HTTPServer

# Override the HTTP server creation to store the reference to the server
def create_server(*args, **kwargs):
    global server
    server = original_create_server(*args, **kwargs)
    return server

class CustomHTTPRequestHandler(BaseHTTPRequestHandler):
    def handle_request(self, event):
        try:
            self.command = event['http']['method']
            self.path = f"{event['http']['path']}{event['url'].get('search', '')}"
            self.headers = event.get('headers', {})
            self.rfile = event['body'].encode() if isinstance(event['body'], str) else event['body']
            self.client_address = (event['http']['sourceIp'], 0)
            
            # Emit the request to the server
            server.process_request(self, None)
        
        except Exception as e:
            self.send_response(500)
            if os.getenv('GENEZIO_DEBUG_MODE') == 'true':
                self.end_headers()
                self.wfile.write(str(e).encode())
            else:
                self.end_headers()
                self.wfile.write(b"Internal Server Error")

# Function to send the request
async def send_request(event):
    handler = CustomHTTPRequestHandler(request=None, client_address=(event['http']['sourceIp'], 0), server=server)
    handler.handle_request(event)

# Async handler function
def handler(event):
    asyncio.run(send_request(event))
`;

        await writeToFile(outputPath, handlerFileName, handlerContent);
    }

    // NOT USED
    async getLocalFunctionWrapperCode(handler: string, entry: string): Promise<string> {
        return `${handler} ${entry}`;
    }
}
