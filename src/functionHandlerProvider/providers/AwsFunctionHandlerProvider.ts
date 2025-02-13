import crypto from "crypto";
import { writeToFile } from "../../utils/file.js";
import { FunctionConfiguration } from "../../models/projectConfiguration.js";
import { FunctionHandlerProvider } from "../functionHandlerProvider.js";
import path from "path";

const streamifyOverrideFileContent = `
const METADATA_PRELUDE_CONTENT_TYPE = 'application/vnd.awslambda.http-integration-response';
const DELIMITER_LEN = 8;

global.awslambda = {
        streamifyResponse: function (handler) {
                return async (event, context) => {
                        await handler(event, event.responseStream, context);
                }
        },
        HttpResponseStream: {
            from: function (underlyingStream, prelude) {
                underlyingStream.setContentType(METADATA_PRELUDE_CONTENT_TYPE);

                // JSON.stringify is required. NULL byte is not allowed in metadataPrelude.
                const metadataPrelude = JSON.stringify(prelude);

                underlyingStream._onBeforeFirstWrite = (write) => {
                    write(metadataPrelude);

                    // Write 8 null bytes after the JSON prelude.
                    write(new Uint8Array(DELIMITER_LEN));
                };

                return underlyingStream;
            }
        }
};`;
const streamifyOverrideFileContentPython = `
import json

METADATA_PRELUDE_CONTENT_TYPE = 'application/vnd.awslambda.http-integration-response'
DELIMITER_LEN = 8

class AwsLambda:
    @staticmethod
    async def streamify_response(handler):
        async def wrapper(event, context):
            await handler(event, event['response_stream'], context)
        return wrapper

    class HttpResponseStream:
        @staticmethod
        def from_stream(underlying_stream, prelude):
            underlying_stream.set_content_type(METADATA_PRELUDE_CONTENT_TYPE)

            metadata_prelude = json.dumps(prelude)

            def on_before_first_write(write):
                write(metadata_prelude)

                write(bytearray(DELIMITER_LEN))

            underlying_stream._on_before_first_write = on_before_first_write

            return underlying_stream
`;

export class AwsFunctionHandlerProvider implements FunctionHandlerProvider {
    async write(
        outputPath: string,
        handlerFileName: string,
        functionConfiguration: FunctionConfiguration,
    ): Promise<void> {
        const randomFileId = crypto.randomBytes(8).toString("hex");
        const handlerContent =
            `import './setupLambdaGlobals_${randomFileId}.mjs';
import { ${functionConfiguration.handler} as genezioDeploy } from "./${functionConfiguration.entry}";
import { isUtf8 } from "buffer";

function formatTimestamp(timestamp) {
  const date = new Date(timestamp);

  const day = String(date.getUTCDate()).padStart(2, "0");
  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec"
  ];
  const month = monthNames[date.getUTCMonth()];
  const year = date.getUTCFullYear();

  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  const seconds = String(date.getUTCSeconds()).padStart(2, "0");

  const formattedDate = ` +
            "`${day}/${month}/${year}:${hours}:${minutes}:${seconds} +0000`" +
            `;
  return formattedDate;
}

const handler = async function(event) {
  const http2CompliantHeaders = {};
  for (const header in event.headers) {
    http2CompliantHeaders[header.toLowerCase()] = event.headers[header];
  }

  const isBinary = !isUtf8(event.body);

  const req = {
    version: "2.0",
    routeKey: "$default",
    rawPath: event.url.pathname,
    rawQueryString: event.url.search,
    headers: http2CompliantHeaders,
    queryStringParameters: Object.fromEntries(event.url.searchParams),
    requestContext: {
      accountId: "anonymous",
      apiId: event.headers.Host.split(".")[0],
      domainName: event.headers.Host,
      domainPrefix: event.headers.Host.split(".")[0],
      http: {
        method: event.http.method,
        path: event.http.path,
        protocol: event.http.protocol,
        sourceIp: event.http.sourceIp,
        userAgent: event.http.userAgent
      },
      requestId: "undefined",
      routeKey: "$default",
      stage: "$default",
      time: formatTimestamp(event.requestTimestampMs),
      timeEpoch: event.requestTimestampMs
    },
    body: event.body.toString(/* encoding= */ isBinary ? "base64" : "utf8"),
    isBase64Encoded: isBinary,
    responseStream: event.responseStream,
  };

  const result = await genezioDeploy(req)

  // Ensure result and headers exist
  if (!result) {
    return { headers: {} };
  }
  
  if (!result.headers) {
    result.headers = {};
  }

  // Only process cookies if they exist
  if (result.cookies && Array.isArray(result.cookies)) {
    for (const cookie of result.cookies) {
      result.headers["Set-Cookie"] = cookie;
    }
  }

  return result;
};

export { handler };`;

        await writeToFile(outputPath, handlerFileName, handlerContent);
        await writeToFile(
            outputPath,
            `setupLambdaGlobals_${randomFileId}.mjs`,
            streamifyOverrideFileContent,
        );
    }

    async getLocalFunctionWrapperCode(
        handler: string,
        functionConfiguration: FunctionConfiguration,
    ): Promise<string> {
        return `import { ${handler} as userHandler } from "./${functionConfiguration.entry}";



import http from "http";



const port = process.argv[2];



const server = http.createServer((req, res) => {

    if (req.method === 'POST') {

    let body = '';

    req.on('data', chunk => {

        body += chunk.toString();

    });

    req.on('end', () => {

        res.writeHead(200, {'Content-Type': 'text/plain'});

        const jsonParsedBody = JSON.parse(body);



        userHandler(jsonParsedBody).then((response) => {

        res.end(JSON.stringify(response));

    })

    });

    } else {

    res.writeHead(404, {'Content-Type': 'text/plain'});

    res.end('404 Not Found');

    }

});



server.listen(port, () => {

});

`;
    }
}

export class AwsPythonFunctionHandlerProvider implements FunctionHandlerProvider {
    async write(
        outputPath: string,
        handlerFileName: string,
        functionConfiguration: FunctionConfiguration,
    ): Promise<void> {
        const randomFileId = crypto.randomBytes(8).toString("hex");
        const nameModule = path
            .join(functionConfiguration.path, functionConfiguration.entry)
            .replace(/\\/g, ".") // Convert backslashes to dots (Windows)
            .replace(/\//g, ".") // Convert slashes to dots (Unix)
            .replace(/^\.+/, "") // Remove leading dots
            .replace(/\.+/g, ".") // Remove duplicate dots
            .replace(/\.py$/, "") // Remove extension
            .replace(/-/g, "_"); // Convert hyphens to underscores for Python module compatibility

        const handlerContent = `
from setupLambdaGlobals_${randomFileId} import AwsLambda
from ${nameModule} import ${functionConfiguration.handler} as genezio_deploy
import codecs

def format_timestamp(timestamp):
    from datetime import datetime
    return datetime.utcfromtimestamp(timestamp / 1000).strftime('%d/%b/%Y:%H:%M:%S +0000')

def is_utf8(data):
    try:
        if isinstance(data, bytes):
            codecs.decode(data, 'utf-8')
        return True
    except UnicodeDecodeError:
        return False

def handler(event):
    headers = event.get('headers', {})
    http2_compliant_headers = {header.lower(): value for header, value in headers.items()}

    body = event.get('body', None)
    is_binary = body is not None and not is_utf8(body)

    req = {
        "version": "2.0",
        "routeKey": "$default",
        "rawPath": event.get('path', '/'),
        "rawQueryString": event.get('query', ''),
        "headers": http2_compliant_headers,
        "queryStringParameters": {
            key: value for key, value in [param.split('=') for param in event.get('query', '').split('&') if '=' in param]
        },
        "requestContext": {
            "accountId": "anonymous",
            "apiId": headers.get('host', '').split('.')[0],
            "domainName": headers.get('host', ''),
            "domainPrefix": headers.get('host', '').split('.')[0],
            "http": {
                "method": event.get('http', {}).get('method', 'GET'),
                "path": event.get('path', '/'),
                "protocol": f"HTTP/{event.get('http', {}).get('protocol', ['1', '1'])[0]}.{event.get('http', {}).get('protocol', ['1', '1'])[1]}",
                "sourceIp": event.get('http', {}).get('sourceIp', '0.0.0.0'),
                "userAgent": event.get('http', {}).get('userAgent', 'unknown')
            },
            "requestId": "undefined",
            "routeKey": "$default",
            "stage": "$default",
            "time": format_timestamp(event.get('requestTimestampMs', 0)),
            "timeEpoch": event.get('requestTimestampMs', 0)
        },
        "body": (body if isinstance(body, str) else body.decode('utf-8') if body else None) if not is_binary else (body.decode('latin-1') if body else None),
        "isBase64Encoded": is_binary,
        "response_stream": event.get('responseStream', None),
    }

    result = genezio_deploy(req)
    
    # Ensure we always have a dict result with headers
    if result is None:
        result = {"headers": {}}
    elif not isinstance(result, dict):
        result = {"headers": {}, "body": str(result)}
    elif "headers" not in result:
        result["headers"] = {}
    
    if 'cookies' in result:
        result['headers']['Set-Cookie'] = result['cookies']

    return result`;

        await writeToFile(outputPath, handlerFileName, handlerContent);
        await writeToFile(
            outputPath,
            `setupLambdaGlobals_${randomFileId}.py`,
            streamifyOverrideFileContentPython,
        );
    }

    async getLocalFunctionWrapperCode(
        handler: string,
        functionConfiguration: FunctionConfiguration,
    ): Promise<string> {
        const nameModule = path
            .join(functionConfiguration.path, functionConfiguration.entry)
            .replace(/\\/g, ".") // Convert backslashes to dots (Windows)
            .replace(/\//g, ".") // Convert slashes to dots (Unix)
            .replace(/^\.+/, "") // Remove leading dots
            .replace(/\.+/g, ".") // Remove duplicate dots
            .replace(/\.py$/, "") // Remove extension
            .replace(/-/g, "_"); // Convert hyphens to underscores for Python module compatibility;

        return `
import sys
import json
from http.server import BaseHTTPRequestHandler, HTTPServer
from ${nameModule} import ${handler} as userHandler

class RequestHandler(BaseHTTPRequestHandler):
    def log_error(self, format, *args):
        # Disable default error logging since we handle it ourselves
        pass

    def do_POST(self):
        content_length = int(self.headers['Content-Length'])
        post_data = self.rfile.read(content_length)
        
        try:
            jsonParsedBody = json.loads(post_data)
            response = userHandler(jsonParsedBody)
            
            # Ensure we always have a dict result with headers
            if response is None:
                response = {"headers": {}}
            elif not isinstance(response, dict):
                response = {"headers": {}, "body": str(response)}
            elif "headers" not in response:
                response["headers"] = {}

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(response).encode('utf-8'))
        except Exception as e:
            import traceback
            error_trace = traceback.format_exc()
            error_response = {
                "statusCode": 500,
                "body": {
                    "message": str(e),
                    "stacktrace": error_trace
                }
            }
            
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(error_response).encode('utf-8'))
            
            # Log the HTTP access first
            self.log_message('"%s" %s %s',
                           self.requestline, str(500), '-')
            
            # Then print the error details
            print("Traceback:", error_trace, file=sys.stderr)
            print("Error occurred:", str(e), file=sys.stderr)
            sys.stderr.flush()
        finally:
            sys.stdout.flush()
            sys.stderr.flush()

def run():
    port = int(sys.argv[1])
    server_address = ('', port)
    httpd = HTTPServer(server_address, RequestHandler)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        sys.stdout.flush()  
        httpd.server_close()

if __name__ == "__main__":
    run()
`;
    }
}
