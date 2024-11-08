import { writeToFile } from "../../utils/file.js";
import { FunctionConfiguration } from "../../models/projectConfiguration.js";
import { FunctionHandlerProvider } from "../functionHandlerProvider.js";
import path from "path";

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

    const http2CompliantHeaders = {};
    for (const header in event.headers) {
      http2CompliantHeaders[header.toLowerCase()] = event.headers[header];
    }

    req.headers = http2CompliantHeaders;

    req.body = event.body;
    req.connection = {
        remoteAddress: event.http.sourceIp
    }

    const res = new http.ServerResponse(req);

    res.writeHead = (status, headersLocal) => {
        event.responseStream.statusCode = res.statusCode;
        event.responseStream.writeHead(status, headersLocal);
    }

    res.write = data => {
        event.responseStream.statusCode = res.statusCode;
        event.responseStream.write(data);
    }

    res.end = data => {
        event.responseStream.statusCode = res.statusCode;
        event.responseStream.end(data);
        resolve();
    }

    res.setHeader = (name, value) => {
        event.responseStream.setHeader(name, value);
    }

    res.getHeader = name => {
        return event.responseStream.getHeader(name);
    }

    res.getHeaderNames = () => {
        return event.responseStream.getHeaderNames();
    }

    res.removeHeader = name => {
        event.responseStream.removeHeader(name);
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
        const nameModule = path
            .join(functionConfiguration.path || "", functionConfiguration.entry || "")
            .replace(/\\/g, ".") // Convert backslashes to dots (Windows)
            .replace(/\//g, ".") // Convert slashes to dots (Unix)
            .replace(/^\.+/, "") // Remove leading dots
            .replace(/\.+/g, ".") // Remove duplicate dots
            .replace(/\.py$/, ""); // Remove extension

        const handlerContent = `
import asyncio
import traceback
from io import BytesIO
import base64
from ${nameModule} import ${functionConfiguration.handler} as application

async def handler(event):
    """Main handler to route requests to the appropriate application type.

    Args:
        event (dict): Incoming event data containing request information.

    Returns:
        dict: HTTP response as a dictionary.
    """
    try:
        # Determine if the application is ASGI or WSGI
        if callable(application) and asyncio.iscoroutinefunction(application.__call__):
            return await asgi_handler(event)
        else:
            return wsgi_handler(event)
    except Exception as e:
        return handle_exception(e)

def handle_exception(e):
    """Handle exceptions and format them into an HTTP response.

    Args:
        e (Exception): The exception to handle.

    Returns:
        dict: A formatted HTTP error response.
    """
    print("Error processing request:", traceback.format_exc())
    return {
        "statusCode": 500,
        "headers": {"Content-Type": "text/plain"},
        "body": "Internal Server Error",
    }

def wsgi_handler(event):
    """Handler for WSGI applications.

    Args:
        event (dict): Incoming event data containing request information.

    Returns:
        dict: HTTP response as a dictionary.
    """
    http_info = event.get('http', {})
    path = event.get('path', http_info.get('path', '/'))
    environ = create_wsgi_environ(event, http_info, path)

    status_code = 500
    headers_dict = {}
    response_stream = event.get("responseStream")

    def start_response(status, headers, exc_info=None):
        """WSGI start response callable."""
        nonlocal status_code, headers_dict
        status_code = int(status.split()[0])
        headers_dict = {key: value for key, value in headers}

    # Generate the response from the WSGI application
    app_response = application(environ, start_response)
    return stream_response(app_response, response_stream, status_code, headers_dict)

def stream_response(app_response, response_stream, status_code, headers_dict):
    """Stream the response from the WSGI application.

    Args:
        app_response: WSGI application response.
        response_stream: The response stream to write to.
        status_code (int): The HTTP status code.
        headers_dict (dict): The response headers.

    Returns:
        dict: Formatted HTTP response.
    """
    for chunk in app_response:
        if isinstance(chunk, bytes):
            response_stream.write(chunk)
        else:
            response_stream.write(chunk.encode())
    
    return {
        "statusCode": status_code,
        "headers": headers_dict,
        "body": None,
    }

async def asgi_handler(event):
    """Handler for ASGI applications.

    Args:
        event (dict): Incoming event data containing request information.

    Returns:
        dict: HTTP response as a dictionary.
    """
    http_info = event.get('http', {})
    path = event.get('path', http_info.get('path', '/'))
    scope = create_asgi_scope(event, http_info, path)

    status_code = 500
    headers_dict = {}
    response_body = b""

    async def send(message):
        """Send ASGI messages to construct the response."""
        nonlocal status_code, headers_dict, response_body
        if message["type"] == "http.response.start":
            status_code = message["status"]
            headers_dict = {key.decode(): value.decode() for key, value in message["headers"]}
        elif message["type"] == "http.response.body":
            response_body += message.get("body", b"")

    async def receive():
        """Receive ASGI messages."""
        return {
            "type": "http.request",
            "body": event.get('body', b""),
            "more_body": False
        }

    # Call the ASGI application
    await application(scope, receive, send)

    return format_response(response_body, headers_dict, status_code)

def create_wsgi_environ(event, http_info, path):
    """Create the WSGI environment from the event data.

    Args:
        event (dict): Incoming event data.
        http_info (dict): HTTP request information.
        path (str): Request path.

    Returns:
        dict: WSGI environment.
    """
    return {
        'REQUEST_METHOD': http_info.get('method', 'GET'),
        'PATH_INFO': path,
        'QUERY_STRING': event.get('query', ''),
        'REMOTE_ADDR': http_info.get('sourceIp', ''),
        'CONTENT_TYPE': event.get('headers', {}).get('CONTENT-TYPE', ''),
        'CONTENT_LENGTH': str(len(event.get('body', ''))),
        'wsgi.input': BytesIO(
            event.get('body', '').encode() if isinstance(event.get('body', ''), str) else event['body']),
        'wsgi.errors': BytesIO(),
        'wsgi.url_scheme': 'http',
        **create_wsgi_headers(event.get('headers', {}))
    }

def create_asgi_scope(event, http_info, path):
    """Create the ASGI scope from the event data.

    Args:
        event (dict): Incoming event data.
        http_info (dict): HTTP request information.
        path (str): Request path.

    Returns:
        dict: ASGI scope.
    """
    return {
        "type": "http",
        "http_version": "1.1",
        "method": http_info.get('method', 'GET'),
        "path": path,
        "query_string": event.get("query", "").encode(),
        "headers": [
            (key.lower().encode(), value.encode())
            for key, value in event.get("headers", {}).items()
        ],
        "client": (http_info.get("sourceIp", ""), 0),
        "server": ("server", 80),
    }

def create_wsgi_headers(headers):
    """Create WSGI headers from the incoming headers.

    Args:
        headers (dict): Incoming headers.

    Returns:
        dict: Formatted WSGI headers.
    """
    return {f"HTTP_{header.upper().replace('-', '_')}": value for header, value in headers.items()}

def format_response(response_body, headers, status_code):
    """Format the response for HTTP output.

    Args:
        response_body (bytes): The body of the response.
        headers (dict): Response headers.
        status_code (int): HTTP status code.

    Returns:
        dict: Formatted HTTP response.
    """
    content_type = headers.get("Content-Type", "text/html")
    
    # Decode response body if it's bytes and intended as text
    if isinstance(response_body, bytes):
        try:
            body = response_body.decode("utf-8", errors='replace')
        except UnicodeDecodeError:
            body = base64.b64encode(response_body).decode("utf-8")
    else:
        body = response_body

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
