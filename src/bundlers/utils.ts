import { log } from "../utils/logging.js";
import { ClassConfiguration } from "../models/projectConfiguration.js";
import { fileExists } from "../utils/file.js";
import { BundlerInterface, BundlerOutput } from "./bundler.interface.js";
import { TsRequiredDepsBundler } from "./node/typescriptRequiredDepsBundler.js";
import { TypeCheckerBundler } from "./node/typeCheckerBundler.js";
import { NodeJsBundler } from "./node/nodeJsBundler.js";
import { NodeJsBinaryDependenciesBundler } from "./node/nodeJsBinaryDependenciesBundler.js";
import { BundlerComposer } from "./bundlerComposer.js";
import { DartBundler } from "./dart/dartBundler.js";
import { KotlinBundler } from "./kotlin/kotlinBundler.js";
import { NewGoBundler } from "./go/goBundler.js";
import { debugLogger, printAdaptiveLog } from "../utils/logging.js";
import { createTemporaryFolder } from "../utils/file.js";
import { ProjectConfiguration } from "../models/projectConfiguration.js";
import { Program } from "../models/genezioModels.js";
import { UserError } from "../errors.js";
import { Language } from "../projectConfiguration/yaml/models.js";

export async function bundle(
    projectConfiguration: ProjectConfiguration,
    ast: Program,
    element: ClassConfiguration,
    installDeps: boolean = true,
    disableOptimization: boolean = false,
): Promise<BundlerOutput> {
    if (!(await fileExists(element.path))) {
        printAdaptiveLog("Bundling your code\n", "error");
        log.error(`\`${element.path}\` file does not exist at the indicated path.`);

        throw new UserError(`\`${element.path}\` file does not exist at the indicated path.`);
    }

    let bundler: BundlerInterface;

    switch (element.language) {
        case "ts": {
            const requiredDepsBundler = new TsRequiredDepsBundler();
            const typeCheckerBundler = new TypeCheckerBundler();
            const standardBundler = new NodeJsBundler();
            const binaryDepBundler = new NodeJsBinaryDependenciesBundler();
            bundler = new BundlerComposer([
                requiredDepsBundler,
                typeCheckerBundler,
                standardBundler,
                binaryDepBundler,
            ]);
            break;
        }
        case "js": {
            const standardBundler = new NodeJsBundler();
            const binaryDepBundler = new NodeJsBinaryDependenciesBundler();
            bundler = new BundlerComposer([standardBundler, binaryDepBundler]);
            break;
        }
        case "dart": {
            bundler = new DartBundler();
            break;
        }
        case "kt": {
            bundler = new KotlinBundler();
            break;
        }
        case "go": {
            bundler = NewGoBundler(projectConfiguration);
            break;
        }
        default:
            throw new UserError(`Unsupported ${element.language}`);
    }

    debugLogger.debug(`The bundling process has started for file ${element.path}...`);

    const tmpFolder = await createTemporaryFolder();
    const output = await bundler.bundle({
        projectConfiguration: projectConfiguration,
        genezioConfigurationFilePath: process.cwd(),
        ast: ast,
        configuration: element,
        path: element.path,
        extra: {
            mode: "production",
            tmpFolder: tmpFolder,
            installDeps,
            disableOptimization,
        },
    });
    debugLogger.debug(`The bundling process finished successfully for file ${element.path}.`);
    return output;
}

export function getLocalFunctionWrapperCode(handler: string, entry: string, language: Language) {
    switch (language) {
        case Language.js:
        case Language.ts:
            return `import { ${handler} as userHandler } from "./${entry}";

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
        case "python":
            return `
import sys
import json
from http.server import BaseHTTPRequestHandler, HTTPServer
from ${entry.split(".")[0]} import ${handler} as userHandler

class RequestHandler(BaseHTTPRequestHandler):

    def do_POST(self):
        content_length = int(self.headers['Content-Length'])
        post_data = self.rfile.read(content_length)
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()

        try:
            jsonParsedBody = json.loads(post_data)
            response = userHandler(jsonParsedBody)
            self.wfile.write(json.dumps(response).encode('utf-8'))
            sys.stdout.flush()
        except Exception as e:
            self.send_response(500)
            self.wfile.write(f"Error: {str(e)}".encode('utf-8'))
            sys.stdout.flush()

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
        default:
            throw new Error(`${language} is not supported yet for testing locally`);
    }
}
