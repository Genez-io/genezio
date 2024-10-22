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
import base64
from ${functionConfiguration.entry.split(".")[0]} import app as application

def handler(event):
    try:
        # Parse HTTP information from the event
        http_info = event.get('http', {})
        path = event.get('path', http_info.get('path', '/'))

        # Create the WSGI environment from the received HTTP event
        environ = create_wsgi_environ(event, http_info, path)

        # Response buffer
        response_buffer = BytesIO()
        status_code = 500  # Default status in case of error
        headers_dict = {}

        # The start_response function for handling WSGI responses
        def start_response(status, headers, exc_info=None):
            nonlocal status_code, headers_dict
            status_code = int(status.split()[0])  
            headers_dict = {key: value for key, value in headers}
            return response_buffer.write

        # Call the WSGI application and build the response
        app_response = application.wsgi_app(environ, start_response)
        response_body = b''.join(app_response)

        # Return the formatted response based on content type
        return format_response(response_body, headers_dict, status_code)

    except Exception as e:
        # Log errors and return a generic 500 response
        print("Error processing request:", traceback.format_exc())
        return {
            "statusCode": 500,
            "body": "Internal Server Error",
            "headers": {"Content-Type": "text/plain"},
            "error": str(e)
        }

def create_wsgi_environ(event, http_info, path):
    """
    Creates a WSGI environment based on the HTTP information received from the event.
    """
    return {
        'REQUEST_METHOD': http_info.get('method', 'GET'),
        'PATH_INFO': path,
        'QUERY_STRING': event.get('query', ''),
        'REMOTE_ADDR': http_info.get('sourceIp', ''),
        'CONTENT_TYPE': event.get('headers', {}).get('Content-Type', ''),
        'CONTENT_LENGTH': str(len(event.get('body', ''))),
        'wsgi.input': BytesIO(event.get('body', '').encode() if isinstance(event.get('body', ''), str) else event['body']),
        'wsgi.errors': BytesIO(),
        'wsgi.url_scheme': 'http',
        # Add HTTP headers
        **create_wsgi_headers(event.get('headers', {}))
    }

def create_wsgi_headers(headers):
    """
    Transforms the headers from the event into the WSGI required format (prefixing with HTTP_).
    """
    wsgi_headers = {}
    for header, value in headers.items():
        wsgi_headers[f"HTTP_{header.upper().replace('-', '_')}"] = value
    return wsgi_headers

def format_response(response_body, headers, status_code):
    """
    Formats the response to return, ensuring the content type is handled appropriately.
    """
    content_type = headers.get('Content-Type', 'text/html')

    # Depending on the content type, either decode as text or encode as base64
    if 'text' in content_type or 'json' in content_type:
        try:
            body = response_body.decode('utf-8')  # Assume it's text
        except UnicodeDecodeError:
            # If it's not valid UTF-8, treat it as binary
            print("Warning: Response body is not valid UTF-8. Encoding as base64.")
            body = base64.b64encode(response_body).decode('utf-8')
    else:
        # For non-textual (binary) content, encode as base64
        body = base64.b64encode(response_body).decode('utf-8')

    return {
        "statusCode": status_code,
        "body": body,
        "headers": headers
    }
`;

        await writeToFile(outputPath, handlerFileName, handlerContent);
    }

    // NOT USED
    async getLocalFunctionWrapperCode(handler: string, entry: string): Promise<string> {
        return `${handler} ${entry}`;
    }
}
