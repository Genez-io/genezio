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
        const nameModule =
            `${functionConfiguration.path?.replace(/\//g, ".") ?? ""}.${functionConfiguration.entry?.split(".")[0] ?? ""}`
                .replace(/^\.+/, "")
                .replace(/\.+/g, ".");
        const handlerContent = `
from io import BytesIO
import traceback
import base64
from ${nameModule} import ${functionConfiguration.handler} as application

def handler(event):
    """Main entry point for handling incoming requests.

    Args:
        event (dict): The incoming event data containing request information.

    Returns:
        dict: A dictionary containing the HTTP response status code, headers, and body.
    """
    try:
        # Extract HTTP information and path from the event
        http_info = event.get('http', {})
        path = event.get('path', http_info.get('path', '/'))

        # Create WSGI environment for the application
        environ = create_wsgi_environ(event, http_info, path)

        status_code = 500
        headers_dict = {}

        # Obtain the response stream for writing response data
        response_stream = event.get("responseStream")

        def start_response(status, headers, exc_info=None):
            """WSGI start_response function to set status and headers.

            Args:
                status (str): The HTTP status string.
                headers (list): List of (key, value) pairs for headers.
                exc_info (tuple): Exception information.
            """
            nonlocal status_code, headers_dict
            status_code = int(status.split()[0])  
            headers_dict = {key: value for key, value in headers} 
            response_stream.writeHead(status_code, headers_dict)

        def response_generator():
            """Generator to yield the response chunks from the application.

            Yields:
                bytes: The response data chunks.
            """
            try:
                # Call the WSGI application and yield its response
                app_response = application(environ, start_response)
                for chunk in app_response:
                    # Write each chunk to the response stream
                    if isinstance(chunk, bytes):
                        response_stream.write(chunk)
                    else:
                        response_stream.write(chunk.encode())
                    yield chunk  # Yield chunk for further processing
            except Exception as e:
                print("Streaming error:", e)  # Log streaming errors
                response_stream.write(b"Internal Server Error")  # Write error to response stream
                yield b"Internal Server Error"

        # Consume the response generator to trigger processing
        for chunk in response_generator():
            pass  

        # Return the final response structure
        return {
            "statusCode": status_code,
            "headers": headers_dict,
            "body": None  # Body is None for streamed responses
        }

    except Exception as e:
        # Log any errors that occur during processing
        print("Error processing request:", traceback.format_exc())
        if response_stream:
            response_stream.write(b"Internal Server Error")  # Write error to response stream
        return {
            "statusCode": 500,
            "headers": {"Content-Type": "text/plain"},
            "body": "Internal Server Error",  # Return a generic error message
            "error": str(e)  # Include the error message for debugging
        }

def create_wsgi_environ(event, http_info, path):
    """Creates a WSGI environment dictionary based on the event data.

    Args:
        event (dict): The incoming event data.
        http_info (dict): The HTTP information from the event.
        path (str): The request path.

    Returns:
        dict: A dictionary representing the WSGI environment.
    """
    return {
        'REQUEST_METHOD': http_info.get('method', 'GET'),  # Default to GET method
        'PATH_INFO': path,  # Set the request path
        'QUERY_STRING': event.get('query', ''),  # Get query string from event
        'REMOTE_ADDR': http_info.get('sourceIp', ''),  # Get client IP address
        'CONTENT_TYPE': event.get('headers', {}).get('CONTENT-TYPE', ''),  # Get content type
        'CONTENT_LENGTH': str(len(event.get('body', ''))),  # Set content length
        'wsgi.input': BytesIO(event.get('body', '').encode() if isinstance(event.get('body', ''), str) else event['body']),  # Wrap body in BytesIO for WSGI
        'wsgi.errors': BytesIO(),  # Error stream for WSGI
        'wsgi.url_scheme': 'http',  # Set URL scheme to HTTP
        **create_wsgi_headers(event.get('headers', {}))  # Convert headers to WSGI format
    }

def create_wsgi_headers(headers):
    """Converts HTTP headers to WSGI-compatible format.

    Args:
        headers (dict): The HTTP headers from the event.

    Returns:
        dict: A dictionary of headers in WSGI format.
    """
    wsgi_headers = {}
    for header, value in headers.items():
        # Transform header names to WSGI format (e.g., "Content-Type" to "HTTP_CONTENT_TYPE")
        wsgi_headers[f"HTTP_{header.upper().replace('-', '_')}"] = value
    return wsgi_headers

def format_response(response_body, headers, status_code):
    """Formats the response body and prepares it for the client.

    Args:
        response_body (bytes): The raw response body.
        headers (dict): The headers to include in the response.
        status_code (int): The HTTP status code.

    Returns:
        dict: A dictionary containing the formatted response.
    """
    content_type = headers.get('CONTENT-TYPE', 'text/html')

    # Check if the content type indicates text or JSON response
    if 'text' in content_type or 'json' in content_type:
        try:
            body = response_body.decode('utf-8')  # Attempt to decode body as UTF-8
        except UnicodeDecodeError:
            print("Warning: Response body is not valid UTF-8. Encoding as base64.")
            body = base64.b64encode(response_body).decode('utf-8')  # Fallback to base64 encoding
    else:
        body = base64.b64encode(response_body).decode('utf-8')  # Encode non-text bodies as base64

    return {
        "statusCode": status_code,
        "body": body,  # Include the formatted body
        "headers": headers  # Include the original headers
    }
`;

        await writeToFile(outputPath, handlerFileName, handlerContent);
    }

    // NOT USED
    async getLocalFunctionWrapperCode(handler: string, entry: string): Promise<string> {
        return `${handler} ${entry}`;
    }
}
