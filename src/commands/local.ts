import log from "loglevel";
import { NodeJsBundler } from "../bundlers/javascript/nodeJsBundler";
import { NodeTsBundler } from "../bundlers/typescript/nodeTsBundler";
import express from "express";
import chokidar from "chokidar";
import cors from "cors";
import bodyParser from "body-parser";
import { ChildProcess, fork } from "child_process"
import path from "path";
import url from "url";
import * as http from 'http';
import { ProjectConfiguration, ClassConfiguration } from "../models/projectConfiguration";
import { LOCAL_TEST_INTERFACE_URL } from "../constants";
import { GENEZIO_NO_CLASSES_FOUND, PORT_ALREADY_USED } from "../errors";
import { sdkGeneratorApiHandler } from "../generateSdk/generateSdkApi";
import { AstSummary } from "../models/astSummary";
import { getProjectConfiguration } from "../utils/configuration";
import { BundlerInterface } from "../bundlers/bundler.interface";
import { NodeJsLocalBundler } from "../bundlers/javascript/nodeJsLocalBundler";
import { BundlerComposer } from "../bundlers/bundlerComposer";
import { genezioRequestParser } from "../utils/genezioRequestParser";
import { debugLogger } from "../utils/logging";
import { rectifyCronString } from "../utils/rectifyCronString";
import cron from "node-cron";
import { createTemporaryFolder, fileExists, readUTF8File } from "../utils/file";
import { replaceUrlsInSdk, writeSdkToDisk } from "../utils/sdk";
import { reportSuccess as _reportSuccess } from "../utils/reporter";
import { SdkGeneratorResponse } from "../models/sdkGeneratorResponse";
import { GenezioLocalOptions } from "../models/commandOptions";
import { DartBundler } from "../bundlers/dart/dartBundler";


// Function that starts the local environment.
// It also monitors for changes in the user's code and restarts the environment when changes are detected.
export async function startLocalEnvironment(options: GenezioLocalOptions) {
  while (true) {
    // Read the project configuration everytime because it might change
    const yamlProjectConfiguration = await getProjectConfiguration();
    const sdk = await sdkGeneratorApiHandler(yamlProjectConfiguration)
      .catch((error) => {
        // TODO: this is not very generic error handling. The SDK should throw Genezio errors, not babel.
        if (error.code === "BABEL_PARSER_SYNTAX_ERROR") {
          log.error("There is a syntax error in your code.");
          log.error(`Reason Code: ${error.reasonCode}`)
          log.error(`Position: line ${error.loc.line}, column ${error.loc.column}, index ${error.loc.index}`);
          log.error(`Fix the errors and genezio local will restart automatically. Waiting for changes...`);

          return undefined;
        }

        console.log(error);

        throw error;
      })

    // If there was an error generating the SDK, wait for changes and try again
    if (!sdk) {
      await listenForChanges(undefined)
      continue;
    }

    const projectConfiguration = new ProjectConfiguration(
      yamlProjectConfiguration,
      sdk.astSummary
    );

    if (projectConfiguration.classes.length === 0) {
      throw new Error(GENEZIO_NO_CLASSES_FOUND);
    }

    const processForClasses = await startProcesses(projectConfiguration)

    // Start HTTP Server
    const server = await startServerHttp(options.port, sdk.astSummary, yamlProjectConfiguration.name, processForClasses)

    // Start cron jobs
    const crons = await startCronJobs(projectConfiguration, processForClasses)

    await replaceUrlsInSdk(sdk, sdk.files.map((c) => ({ name: c.className, cloudUrl: `http://127.0.0.1:${options.port}/${c.className}` })))
    await writeSdkToDisk(sdk, projectConfiguration.sdk.language, projectConfiguration.sdk.path)

    reportSuccess(projectConfiguration, sdk, options.port)

    // Start listening for changes in user's code
    await listenForChanges(projectConfiguration.sdk.path)

    // When new changes are detected, close everything and restart the process
    clearAllResources(server, processForClasses, crons)
  }
}

/**
 * Bundle each class and start a new process for it.
 */
async function startProcesses(projectConfiguration: ProjectConfiguration): Promise<Map<string, ChildProcess>> {
  const classes = projectConfiguration.classes
  const processForClasses = new Map<string, any>();

  // Bundle each class and start a new process for it
  const bundlersOutputPromise = classes.map((classInfo) => {
    const bundler = getBundler(classInfo)

    if (!bundler) {
      throw new Error("Unsupported language ${classConfiguration.language}.")
    }

    debugLogger.log("Start bundling...")
    // TODO: Is it worth the extra complexity of maintaining the folder?
    return createTemporaryFolder().then((tmpFolder) => {
      return bundler.bundle({
        projectConfiguration,
        path: classInfo.path,
        genezioConfigurationFilePath: process.cwd(),
        configuration: classInfo,
        extra: { mode: "development", tmpFolder: tmpFolder }
      })
    });
  })

  const bundlersOutput = await Promise.all(bundlersOutputPromise);

  for (const bundlerOutput of bundlersOutput) {
    // Start a new process for thsi class and save it in the map
    const classProcess = fork(path.resolve(bundlerOutput.path, 'local.js'))
    processForClasses.set(bundlerOutput.configuration.name, classProcess)
  }

  return processForClasses
}

// Function that returns the correct bundler for the local environment based on language.
function getBundler(classConfiguration: ClassConfiguration): BundlerInterface | undefined {
  let bundler: BundlerInterface | undefined;
  switch (classConfiguration.language) {
    case ".ts": {
      const nodeTsBundler = new NodeTsBundler();
      const localBundler = new NodeJsLocalBundler();
      bundler = new BundlerComposer([nodeTsBundler, localBundler])
      break;
    }
    case ".js": {
      const nodeJsBundler = new NodeJsBundler();
      const localBundler = new NodeJsLocalBundler();
      bundler = new BundlerComposer([nodeJsBundler, localBundler])
      break;
    }
    case ".dart": {
      bundler = new DartBundler();
    }
    default: {
      log.error(
        `Unsupported language ${classConfiguration.language}. Skipping class `
      );
    }
  }

  return bundler;
}

async function startServerHttp(port: number, astSummary: AstSummary, projectName: string, processForClasses: Map<string, any>): Promise<http.Server> {
  const app = express();
  app.use(cors());
  app.use(bodyParser.raw({ type: () => true }));
  app.use(genezioRequestParser);

  app.get("/get-ast-summary", (req: any, res: any) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ...astSummary, name: projectName }));
  });

  app.all(`/:className`, async (req: any, res: any) => {
    const reqToFunction = getEventObjectFromRequest(req);

    const process = processForClasses.get(req.params.className);
    process.on('message', (msg: string) => {
      const msgParsed = JSON.parse(msg)
      if (msgParsed.id === reqToFunction.id) {
        handleResponseForJsonRpc(res, msgParsed.response);
      }
    })

    process.send(JSON.stringify(reqToFunction))
  });

  app.all(`/:className/:methodName`, async (req: any, res: any) => {
    const reqToFunction = getEventObjectFromRequest(req);

    const process = processForClasses.get(req.params.className);
    process.on('message', (msg: string) => {
      const msgParsed = JSON.parse(msg)
      if (msgParsed.id === reqToFunction.id) {
        handleResponseforHttp(res, msgParsed.response);
      }
    })

    process.send(JSON.stringify(reqToFunction))
  });

  return await new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      log.info(`Server listening on port ${port}`);
      resolve(server);
    });

    server.on("error", (error: any) => {
      if (error.code === "EADDRINUSE") {
        reject(new Error(PORT_ALREADY_USED(port)))
      }

      reject(error)
    });
  })
}

export type LocalEnvCronHandler = {
  className: string
  methodName: string,
  cronString: string,
  cronObject: any,
  process: any
}

async function startCronJobs(
  projectConfiguration: ProjectConfiguration,
  processForClasses: Map<string, any>
): Promise<LocalEnvCronHandler[]> {
  const cronHandlers: LocalEnvCronHandler[] = [];
  for (const classElement of projectConfiguration.classes) {
    const methods = classElement.methods;
    for (const method of methods) {
      if (method.type === "cron" && method.cronString) {
        const cronHandler: LocalEnvCronHandler = {
          className: classElement.name,
          methodName: method.name,
          cronString: rectifyCronString(method.cronString),
          cronObject: null,
          process: processForClasses.get(classElement.name)
        };

        cronHandler.cronObject = cron.schedule(cronHandler.cronString, async () => {
          const reqToFunction = {
            genezioEventType: "cron",
            methodName: cronHandler.methodName,
            cronString: cronHandler.cronString
          };

          cronHandler.process.send(JSON.stringify(reqToFunction))
        });

        cronHandler.cronObject.start();
        cronHandlers.push(cronHandler);
      }
    }
  }

  return cronHandlers;
}

async function stopCronJobs(cronHandlers: LocalEnvCronHandler[]) {
  for (const cronHandler of cronHandlers) {
    if (cronHandler.cronObject) {
      await cronHandler.cronObject.stop();
    }
  }
}

function getEventObjectFromRequest(request: any) {
  const urlDetails = url.parse(request.url, true);
  console.log(request.body, request.isBase64Encoded)

  return {
    id: Math.random(),
    headers: request.headers,
    rawQueryString: urlDetails.search ? urlDetails.search?.slice(1) : "",
    queryStringParameters: urlDetails.search
      ? Object.assign({}, urlDetails.query)
      : undefined,
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

function handleResponseForJsonRpc(res: any, jsonRpcResponse: any) {
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(jsonRpcResponse));
}

function handleResponseforHttp(res: any, httpResponse: any) {
  if (httpResponse.statusDescription) {
    res.statusMessage = httpResponse.statusDescription;
  }
  let contentTypeHeader = false;

  if (httpResponse.headers) {
    for (const header of Object.keys(httpResponse.headers)) {
      res.setHeader(header.toLowerCase(), httpResponse.headers[header]);

      if (header.toLowerCase() === "content-type") {
        contentTypeHeader = httpResponse.headers[header];
      }
    }
  }

  if (!contentTypeHeader) {
    res.setHeader("content-type", "application/json");
  }

  if (httpResponse.statusCode) {
    res.writeHead(parseInt(httpResponse.statusCode));
  }

  if (httpResponse.isBase64Encoded === true) {
    res.end(Buffer.from(httpResponse.body, "base64"));
  } else {
    if (Buffer.isBuffer(httpResponse.body)) {
      res.end(JSON.stringify(httpResponse.body.toJSON()));
    } else {
      res.end(httpResponse.body ? httpResponse.body : "");
    }
  }
}

async function listenForChanges(sdkPathRelative: any|undefined) {
  const cwd = process.cwd();

  let sdkPath: any = null;

  if (sdkPathRelative) {
    sdkPath = path.join(cwd, sdkPathRelative);
  }

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
    );

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
    if (sdkPath?.endsWith("/")) {
      sdkPath = sdkPath.slice(0, -1);
    }

    // Watch for changes in the classes and update the handlers
    const watchPaths = [path.join(cwd, "/**/*")];
    let ignoredPaths: string[] = [];

    if (sdkPath) {
      ignoredPaths = [
        "**/node_modules/*",
        // "**/node_modules/**/*",
        sdkPath + "/**/*",
        sdkPath + "/*",
        ...ignoredPathsFromGenezioIgnore
      ];
    } else {
      ignoredPaths = ["**/node_modules/*", ...ignoredPathsFromGenezioIgnore];
    }

    const startWatching = () => {
      const watch = chokidar
        .watch(watchPaths, {
          ignored: ignoredPaths,
          ignoreInitial: true
        })
        .on("all", async (event: any, path: any) => {
          if (sdkPath) {
            if (path.includes(sdkPath)) {
              return;
            }
          }

          console.clear();
          log.info("\x1b[36m%s\x1b[0m", "Change detected, reloading...");

          watch.close();
          resolve({});
        });
    };
    startWatching();
  });
}

function reportSuccess(projectConfiguration: ProjectConfiguration, sdk: SdkGeneratorResponse, port: number) {
  const classesInfo = projectConfiguration.classes.map((c) => ({
    className: c.name,
    methods: c.methods,
    functionUrl: `http://127.0.0.1:${port}/`,
  }));

  _reportSuccess(classesInfo, sdk);

  log.info(
    "\x1b[32m%s\x1b[0m",
    `Test your code at ${LOCAL_TEST_INTERFACE_URL}?port=${port}`
  );
}

async function clearAllResources(server: http.Server, processForClasses: Map<string, ChildProcess>, crons: LocalEnvCronHandler[]) {
  server.close();
  await stopCronJobs(crons);

  processForClasses.forEach((process) => {
    process.kill();
  })
}
