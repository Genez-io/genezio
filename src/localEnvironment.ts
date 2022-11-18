import querystring from "querystring";
import path from "path";
import chokidar from 'chokidar';
import express from 'express'
import cors from 'cors'
import { PORT_LOCAL_ENVIRONMENT } from "./variables";


export function getEventObjectFromRequest(request: any) {
  return {
    headers: request.headers,
    http: {
      // get path without the className
      path: request.url,
      protocol: request.httpVersion,
      method: request.method,
      sourceIp: request.socket.remoteAddress,
      userAgent: request.headers["user-agent"]
    },
    queryParameters: request.url!.includes("?")
      ? querystring.parse(request.url!.split("?")[1])
      : {},
    timeEpoch: Date.now(),
    body: Object.keys(request.body).length > 0 ? JSON.stringify(request.body) : undefined,
    requestContext: {
      http: {
        path: request.url,
      }
    }
  }
}

export function handleResponseForJsonRpc(res: any, jsonRpcResponse: any) {
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(jsonRpcResponse))
}

export function handleResponseforHttp(res: any, httpResponse: any) {
  if (httpResponse.statusDescription) {
    res.statusMessage = httpResponse.statusDescription;
  }
  if (httpResponse.headers) {
    for (const header of Object.keys(httpResponse.headers)) {
      res.setHeader(header, httpResponse.headers[header]);
    }
  }

  if (httpResponse.statusCode) {
    res.writeHead(parseInt(httpResponse.statusCode));
  }

  if (httpResponse.bodyEncoding === "base64") {
    res.write(Buffer.from(httpResponse.body, "base64"));
  } else {
    res.end(httpResponse.body ? httpResponse.body : "");
  }
}

export function listenForChanges(sdkPathRelative: any, server: any) {
  const cwd = process.cwd()

  let sdkPath = path.join(cwd, sdkPathRelative);
  
  return new Promise((resolve) => {
    // delete / if sdkPath ends with /
    if (sdkPath.endsWith("/")) {
      sdkPath = sdkPath.slice(0, -1);
    }

    // Watch for changes in the classes and update the handlers
    const watchPaths = [path.join(cwd, "/**/*")];
    const ignoredPaths = [
      "**/node_modules/*",
      sdkPath + "/**/*",
      sdkPath + "/*"
    ];

    const startWatching = () => {
      chokidar
        .watch(watchPaths, {
          ignored: ignoredPaths,
          ignoreInitial: true
        })
        .on("all", async (event: any, path: any) => {
          if (path.includes(sdkPath)) {
            return;
          }

          console.clear();
          console.log("\x1b[36m%s\x1b[0m", "Change detected, reloading...");
          await server.close();
          resolve({})
        });
    };
    startWatching();
  })
}

export function startServer(handlers: any) {
  const app = express()
  app.use(cors())
  app.use(express.json());
  app.use(express.urlencoded({
    extended: true
  }));

  app.all(`/:className`, async (req: any, res: any) => {
    const reqToFunction = getEventObjectFromRequest(req)

    const path = handlers[req.params.className].path
    console.log(`Request received for ${req.params.className}.`)

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const module = require(path);

    const response = await module.handler(reqToFunction);

    handleResponseForJsonRpc(res, response)
  });

  app.all(`/:className/:methodName`, async (req: any, res: any) => {
    const reqToFunction = getEventObjectFromRequest(req)
    console.log(`HTTP Request received ${req.method} ${req.url}.`)

    const path = handlers[req.params.className].path

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const module = require(path);

    const response = await module.handler(reqToFunction);
    handleResponseforHttp(res, response)
  })

  console.log("Listening...")
  return app.listen(PORT_LOCAL_ENVIRONMENT)
}