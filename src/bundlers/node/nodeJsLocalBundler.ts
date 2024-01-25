import { writeToFile } from "../../utils/file.js";
import path from "path";
import { BundlerInput, BundlerInterface, BundlerOutput } from "../bundler.interface.js";
import { generateNodeContainerManifest } from "./containerManifest.js";
import { spawnSync } from "child_process";
import log from "loglevel";
import { debugLogger } from "../../utils/logging.js";
// This file is the wrapper that is used to run the user's code in a separate process.
// It listens for messages from the parent process and runs the user's code when it receives a message.
export const localWrapperCode = `
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

// Adds a wrapper to the user's code that allows it to be run in a separate process.
export class NodeJsLocalBundler implements BundlerInterface {
    async bundle(input: BundlerInput): Promise<BundlerOutput> {
        await writeToFile(input.path, "local.mjs", localWrapperCode, true);

        const nodeVersion =
            input.projectConfiguration.options?.nodeRuntime === "nodejs18.x" ? "18" : "16";
        // Default command and args
        let startingCommand = "node";
        let commandParameters = [path.resolve(input.path, "local.mjs")];
        // Write docker file for container packaging
        if (input.projectConfiguration.cloudProvider === "cluster") {
            debugLogger.log("Writing docker file for container packaging");
            await writeToFile(input.path, "Dockerfile", generateNodeContainerManifest(nodeVersion));
            startingCommand = "docker";

            const dockerBuildProcess = spawnSync(
                "docker",
                [
                    "build",
                    "-t",
                    input.projectConfiguration.name + "-" + input.configuration.name.toLowerCase(),
                    input.path,
                ],
                { stdio: "pipe", encoding: "utf-8", cwd: input.path },
            );
            if (dockerBuildProcess.status !== 0) {
                log.error(dockerBuildProcess.stderr);
                log.error(dockerBuildProcess.stdout);
                throw new Error("Docker build failed");
            }

            // add docker run command to the command parameters
            commandParameters = [input.projectConfiguration.name];
        }

        return {
            ...input,
            extra: {
                ...input.extra,
                startingCommand: startingCommand,
                commandParameters: commandParameters,
            },
        };
    }
}
