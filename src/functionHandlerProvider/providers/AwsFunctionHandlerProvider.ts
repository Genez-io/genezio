import { writeToFile } from "../../utils/file.js";
import { FunctionConfiguration } from "../../models/projectConfiguration.js";
import { FunctionHandlerProvider } from "../functionHandlerProvider.js";

export class AwsFunctionHandlerProvider implements FunctionHandlerProvider {
    async getHandler(functionConfiguration: FunctionConfiguration): Promise<string> {
        return (
            `import './setupLambdaGlobals.mjs';
import { ${functionConfiguration.handler} as genezioDeploy } from "./${functionConfiguration.entry}";

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
    body: event.isBase64Encoded
      ? Buffer.from(event.body, "base64")
      : event.body.toString(),
    isBase64Encoded: event.isBase64Encoded,
    responseStream: event.responseStream,
  };

  const result = await genezioDeploy(req).catch(error => {
    console.error(error);
    return {
      statusCode: 500,
      body: "Internal server error"
    };
  });

  return result;
};

export { handler };`
        );
    }

    async writeAdditionalFiles(outPath: string): Promise<void> {
        const content = `global.awslambda = {
        streamifyResponse: function (handler) {
                return async (event, context) => {
                        await handler(event, event.responseStream, context);
                }
        },
};`;

        await writeToFile(outPath, "setupLambdaGlobals.mjs", content);
    }
}
