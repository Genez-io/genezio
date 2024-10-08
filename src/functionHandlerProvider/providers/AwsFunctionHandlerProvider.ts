import crypto from "crypto";
import { writeToFile } from "../../utils/file.js";
import { FunctionConfiguration } from "../../models/projectConfiguration.js";
import { FunctionHandlerProvider } from "../functionHandlerProvider.js";

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

  if (result.cookies) {
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
}

export class AwsPythonFunctionHandlerProvider implements FunctionHandlerProvider {
    async write(
        outputPath: string,
        handlerFileName: string,
        functionConfiguration: FunctionConfiguration,
    ): Promise<void> {
        const randomFileId = crypto.randomBytes(8).toString("hex");

        const handlerContent = `
from setupLambdaGlobals_${randomFileId} import AwsLambda
from ${functionConfiguration.entry.split(".")[0]} import ${functionConfiguration.handler} as genezio_deploy

def format_timestamp(timestamp):
    from datetime import datetime
    return datetime.utcfromtimestamp(timestamp / 1000).strftime('%d/%b/%Y:%H:%M:%S +0000')

async def handler(event):
    http2_compliant_headers = {header.lower(): value for header, value in event['headers'].items()}

    is_binary = not is_utf8(event['body']) 

    req = {
        "version": "2.0",
        "routeKey": "$default",
        "rawPath": event['url']['pathname'],
        "rawQueryString": event['url']['search'],
        "headers": http2_compliant_headers,
        "queryStringParameters": dict(event['url']['searchParams']),
        "requestContext": {
            "accountId": "anonymous",
            "apiId": event['headers']['Host'].split('.')[0],
            "domainName": event['headers']['Host'],
            "domainPrefix": event['headers']['Host'].split('.')[0],
            "http": {
                "method": event['http']['method'],
                "path": event['http']['path'],
                "protocol": event['http']['protocol'],
                "sourceIp": event['http']['sourceIp'],
                "userAgent": event['http']['userAgent']
            },
            "requestId": "undefined",
            "routeKey": "$default",
            "stage": "$default",
            "time": format_timestamp(event['requestTimestampMs']),
            "timeEpoch": event['requestTimestampMs']
        },
        "body": event['body'].decode('utf-8') if not is_binary else event['body'].decode('latin-1'),
        "isBase64Encoded": is_binary,
        "response_stream": event['response_stream'],
    }

    result = await genezio_deploy(req)

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
}
