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
from io import BytesIO
import traceback
from ${functionConfiguration.entry.split(".")[0]} import app as application

def handler(event):
    try:
        print("Received event:", event)

        # Verificare pentru 'path' fie în 'http', fie direct în 'event'
        http_info = event.get('http', {})
        path = event.get('path', http_info.get('path', '/'))

        # Crearea variabilelor de mediu WSGI
        environ = {
            'REQUEST_METHOD': http_info.get('method', 'GET'),
            'PATH_INFO': path,
            'QUERY_STRING': event.get('query', ''),
            'REMOTE_ADDR': http_info.get('sourceIp', ''),
            'wsgi.input': BytesIO(event.get('body', '').encode() if isinstance(event.get('body', ''), str) else event['body']),
            'wsgi.errors': BytesIO(),
            'CONTENT_TYPE': event.get('headers', {}).get('Content-Type', ''),
            'CONTENT_LENGTH': str(len(event.get('body', ''))),
            'wsgi.url_scheme': 'http',
        }

        # Adăugarea headerelor HTTP în environ
        for header, value in event.get('headers', {}).items():
            environ[f"HTTP_{header.upper().replace('-', '_')}"] = value

        response_buffer = BytesIO()

        # Funcția 'start_response'
        def start_response(status, headers, exc_info=None):
            status_code = int(status.split()[0] if status else '500')
            headers_dict = {key: value for key, value in headers}
            response = {
                "statusCode": status_code,
                "headers": headers_dict,
            }
            return response_buffer.write

        # Apelarea aplicației WSGI
        app_response = application.wsgi_app(environ, start_response)
        response_body = b''.join(app_response)

        return {
            "statusCode": 200,
            "body": response_body.decode(),
            "headers": {
                "Content-Type": "text/html",
            }
        }

    except Exception as e:
        print("Error processing request:", traceback.format_exc())
        return {
            "statusCode": 500,
            "body": "Internal Server Error",
            "error": str(e)
        }
`;

        await writeToFile(outputPath, handlerFileName, handlerContent);
    }

    // NOT USED
    async getLocalFunctionWrapperCode(handler: string, entry: string): Promise<string> {
        return `${handler} ${entry}`;
    }
}
