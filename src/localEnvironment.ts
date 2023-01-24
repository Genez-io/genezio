import path from "path";
import chokidar from "chokidar";
import express from "express";
import cors from "cors";
import { PORT_LOCAL_ENVIRONMENT } from "./variables";
import { YamlProjectConfiguration } from "./models/yamlProjectConfiguration";
import { NodeJsBundler } from "./bundlers/javascript/nodeJsBundler";
import { NodeTsBundler } from "./bundlers/typescript/nodeTsBundler";
import LocalEnvInputParameters from "./models/localEnvInputParams";
import log from "loglevel";
import { fileExists, readUTF8File } from "./utils/file";
import { exit } from "process";
import bodyParser from 'body-parser'
import url from "url"
import { genezioRequestParser } from "./utils/genezioRequestParser";
import { debugLogger } from "./utils/logging";
import { BundlerInterface } from "./bundlers/bundler.interface";
import { AstSummary } from "./models/generateSdkResponse";

export function getEventObjectFromRequest(request: any) {
  const urlDetails = url.parse(request.url, true)

  return {
    headers: request.headers,
    rawQueryString: urlDetails.search ? urlDetails.search?.slice(1) : '',
    queryStringParameters: urlDetails.search ? Object.assign({}, urlDetails.query) : undefined,
    timeEpoch: Date.now(),
    body: request.body,
    isBase64Encoded: request.isBase64Encoded,
    requestContext: {
      http: {
        method: request.method,
        path: urlDetails.pathname,
        protocol: request.httpVersion,
        sourceIp: request.socket.remoteAddress,
        userAgent: request.headers["user-agent"]
      }
    }
  };
}

export function handleResponseForJsonRpc(res: any, jsonRpcResponse: any) {
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(jsonRpcResponse));
}

export function handleResponseforHttp(res: any, httpResponse: any) {
  if (httpResponse.statusDescription) {
    res.statusMessage = httpResponse.statusDescription;
  }
  let contentTypeHeader = false;

  if (httpResponse.headers) {
    for (const header of Object.keys(httpResponse.headers)) {
      res.setHeader(header.toLowerCase(), httpResponse.headers[header]);

      if (header.toLowerCase() === "content-type") {
        contentTypeHeader = httpResponse.headers[header]
      }
    }
  }

  if (!contentTypeHeader) {
    res.setHeader("content-type", "application/json")
  }

  if (httpResponse.statusCode) {
    res.writeHead(parseInt(httpResponse.statusCode));
  }

  if (httpResponse.isBase64Encoded === true) {
    res.end(Buffer.from(httpResponse.body, "base64"))
  } else {
    if (Buffer.isBuffer(httpResponse.body)) {
      res.end(JSON.stringify(httpResponse.body.toJSON()));
    } else {
      res.end(httpResponse.body ? httpResponse.body : "");
    }
  }
}

export async function listenForChanges(sdkPathRelative: any, server: any) {
  const cwd = process.cwd();

  let sdkPath = path.join(cwd, sdkPathRelative);

  let ignoredPathsFromGenezioIgnore: string[] = [];


  // check for .genezioignore file
  const ignoreFilePath = path.join(cwd, ".genezioignore");
  if (await fileExists(ignoreFilePath)) {
    // read the file as a string
    const ignoreFile = await readUTF8File(ignoreFilePath);
    // split the string by new line \n
    const ignoreFileLines = ignoreFile.split("\n");
    // remove empty lines
    const ignoreFileLinesWithoutEmptyLines = ignoreFileLines.filter(
      (line) => line !== "" && !line.startsWith("#")
    )

    ignoredPathsFromGenezioIgnore = ignoreFileLinesWithoutEmptyLines.map(
      (line: string) => {
        if (line.startsWith("/")) {
          return line;
        }
        return path.join(cwd, line);
      }
    );
  }



  return new Promise((resolve) => {
    // delete / if sdkPath ends with /
    if (sdkPath.endsWith("/")) {
      sdkPath = sdkPath.slice(0, -1);
    }

    // Watch for changes in the classes and update the handlers
    const watchPaths = [path.join(cwd, "/**/*")];
    const ignoredPaths = [
      "**/node_modules/*",
      // "**/node_modules/**/*",
      sdkPath + "/**/*",
      sdkPath + "/*",
      ...ignoredPathsFromGenezioIgnore
    ];

    const startWatching = () => {
      const watch = chokidar
        .watch(watchPaths, {
          ignored: ignoredPaths,
          ignoreInitial: true
        })
        .on("all", async (event: any, path: any) => {
          if (path.includes(sdkPath)) {
            return;
          }

          console.clear();
          log.info("\x1b[36m%s\x1b[0m", "Change detected, reloading...");
          if (server) {
            await server.close();
          }

          watch.close();
          resolve({});
        });
    };
    startWatching();
  });
}

export async function startServer(
  handlers: any,
  astSummary: any,
  port = PORT_LOCAL_ENVIRONMENT
) {
  const app = express();
  app.use(cors());
  app.use(bodyParser.raw({ type: () => true }))
  app.use(genezioRequestParser);

  app.get("/get-ast-summary", (req: any, res: any) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(astSummary));
  });

  app.all(`/:className`, async (req: any, res: any) => {
    const reqToFunction = getEventObjectFromRequest(req);

    const localHandler = handlers[req.params.className];
    if (!localHandler) {
      res.status(404).send("Not found");
      return;
    }

    const path = localHandler.path;
    log.debug(`Request received for ${req.params.className}.`);

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const module = require(path);

    const response = await module.handler(reqToFunction);

    handleResponseForJsonRpc(res, response);
  });

  app.all(`/:className/:methodName`, async (req: any, res: any) => {
    const reqToFunction = getEventObjectFromRequest(req);
    log.debug(`HTTP Request received ${req.method} ${req.url}.`);

    const handler = handlers[req.params.className];
    if (!handler) {
      log.error(
        `Could not find class ${req.params.className}. The path should be /<class_name>/<method_name>`
      );
      res.set("Content-Type", "application/json");
      res.writeHead(404);
      res.end(
        JSON.stringify({ error: `Class not found ${req.params.className}.` })
      );
      return;
    }

    const path = handler.path;

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const module = require(path);

    const response = await module.handler(reqToFunction);
    handleResponseforHttp(res, response);
  });

  return app.listen(port, () => {
    log.info(`Server listening on port ${port}`);
  })
}

export async function prepareForLocalEnvironment(
  projectConfiguration: YamlProjectConfiguration,
  astSummary: AstSummary,
  port = PORT_LOCAL_ENVIRONMENT
): Promise<LocalEnvInputParameters> {
  const functionUrlForFilePath: any = {};
  const handlers: any = {};
  const classesInfo: {
    className: any;
    methods: any;
    path: string;
    functionUrl: string;
  }[] = [];

  const promises = projectConfiguration.classes.map(async (element: any) => {
    if (!(await fileExists(element.path))) {
      log.error(
        `\`${element.path}\` file does not exist at the indicated path.`
      );
      exit(1);
    }
    const astClassSummary = astSummary.classes.find((c) => c.path === element.path)

    if (!astClassSummary) {
      debugLogger.debug(
        `Could not find astClassSummary for element ${element}`
      );
      return Promise.resolve();
    }

    let bundler: BundlerInterface
    switch (element.language) {
      case ".ts": {
        bundler = new NodeTsBundler();
        break
      }
      case ".js": {
        bundler = new NodeJsBundler();
        break
      }
      default: {
        log.error(
          `Unsupported language ${element.language}. Skipping class ${element.path}`
        );
        return Promise.resolve();
      }
    }

    debugLogger.debug(`The bundling process has started for file ${element.path}...`)
    return bundler
      .bundle({
        configuration: element,
        path: element.path,
        extra: { mode: "development" }
      })
      .then((output) => {
        debugLogger.debug("The bundling process finished successfully.")
        const className = astClassSummary.name;
        const handlerPath = path.join(output.path, "index.js");
        const baseurl = `http://127.0.0.1:${port}/`;
        const functionUrl = `${baseurl}${className}`;
        functionUrlForFilePath[path.parse(element.path).name] = functionUrl;

        classesInfo.push({
          className: className,
          methods: astClassSummary?.methods,
          path: element.path,
          functionUrl: baseurl
        });

        handlers[className] = {
          path: handlerPath
        };
      });
  });

  await Promise.all(promises);

  return {
    functionUrlForFilePath,
    handlers,
    classesInfo
  };
}
