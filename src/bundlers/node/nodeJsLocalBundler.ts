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
${localWrapperCode}
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
