import { writeToFile } from "../../utils/file.js";
import path from "path";
import { BundlerInput, BundlerInterface, BundlerOutput } from "../bundler.interface.js";
import { CloudProviderIdentifier } from "../../models/cloudProviderIdentifier.js";
// This file is the wrapper that is used to run the user's code in a separate process.
// It listens for messages from the parent process and runs the user's code when it receives a message.
const localWrapperCode = `
import { handler as userHandler } from "./index.mjs";
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

const localClusterWrapperCode = `
import http from "http";
import { handler as userHandler } from "./index.mjs";

const port = process.argv[2];
const server = http.createServer()
server.on('request', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  let body = '';
  req.on('data', chunk => {
    body += chunk.toString();
  });

  req.on('end', () => {
    try {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      if (body === "") {
        res.end(JSON.stringify({ message: "No body" }));
        return;
      }

      const requestContext = {
        http: {
          method: "POST",
          path: "/",
          protocol: "1.1",
          sourceIp: "::1",
          userAgent: req.headers["user-agent"],
        }
      }

      const input = JSON.parse(body);

      userHandler({
        body: input.body,
        requestContext: input.requestContext || requestContext,
      }).then((response) => {  
        res.end(JSON.stringify({
          "statusCode":200,
          "body": response.body,
          "headers": {
            "Content-Type":"application/json",
            "X-Powered-By":"genezio"
          }
        }));
      })
    } catch (error) {
    }
  });
})

server.listen(port, () => {
})

export { server }
`;

// Adds a wrapper to the user's code that allows it to be run in a separate process.
export class NodeJsLocalBundler implements BundlerInterface {
    async bundle(input: BundlerInput): Promise<BundlerOutput> {
        const selectedClass = input.projectConfiguration.classes.find(
            (c) => input.configuration.name === c.name,
        );
        if (!selectedClass) {
            throw new Error("Class not found");
        }

        const isClusterDeployment =
            input.projectConfiguration.cloudProvider === CloudProviderIdentifier.CLUSTER;
        await writeToFile(
            input.path,
            "local.mjs",
            isClusterDeployment ? localClusterWrapperCode : localWrapperCode,
            true,
        );

        return {
            ...input,
            extra: {
                ...input.extra,
                startingCommand: "node",
                commandParameters: [
                    path.resolve(input.path, isClusterDeployment ? "index.mjs" : "local.mjs"),
                ],
            },
        };
    }
}
