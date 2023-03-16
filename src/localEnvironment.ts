import path from "path";
import chokidar from "chokidar";
import express from "express";
import cors from "cors";
import { PORT_LOCAL_ENVIRONMENT } from "./variables";
import { YamlProjectConfiguration } from "./models/yamlProjectConfiguration";
import { NodeJsBundler } from "./bundlers/javascript/nodeJsBundler";
import { NodeTsBundler } from "./bundlers/typescript/nodeTsBundler";
import {
  LocalEnvInputParameters,
  LocalEnvCronHandler,
  LocalEnvStartServerOutput
} from "./models/localEnvInputParams";
import log from "loglevel";
import { createTemporaryFolder, fileExists, readUTF8File } from "./utils/file";
import { exit } from "process";
import bodyParser from "body-parser";
import url from "url";
import { genezioRequestParser } from "./utils/genezioRequestParser";
import { debugLogger } from "./utils/logging";
import { BundlerInterface } from "./bundlers/bundler.interface";
import { AstSummary, AstSummaryMethod } from "./models/generateSdkResponse";
import { ClassConfiguration, ProjectConfiguration } from "./models/projectConfiguration";
import cron from "node-cron";
import fs from "fs";
import generateSdkRequest from "./requests/generateSdk";
import { reportSuccess } from "./commands";
import { getProjectConfiguration } from "./utils/configuration";
import { replaceUrlsInSdk, writeSdkToDisk } from "./utils/sdk";

export function getEventObjectFromRequest(request: any) {
  const urlDetails = url.parse(request.url, true);

  return {
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

export async function listenForChanges(
  sdkPathRelative: any,
  server: any,
  cronHandlers: LocalEnvCronHandler[] | null
) {
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
          if (server && cronHandlers) {
            // removed await for now for faster reloads
            server.close();
            stopCronJobs(cronHandlers);
          }

          watch.close();
          resolve({});
        });
    };
    startWatching();
  });
}

export async function stopCronJobs(cronHandlers: LocalEnvCronHandler[]) {
  for (const cronHandler of cronHandlers) {
    if (cronHandler.cronObject) {
      await cronHandler.cronObject.stop();
    }
  }
}

// Converts non-standard cron strings of the type X/Y * * * * to standard X-59/Y * * * *,
// applied to all fields.
export function rectifyCronString(cronString: string): string {
  const parts = cronString.split(' ');
  const minutes = parts[0].replace(/^(\d+)\/(\d+)$/, '$1-59/$2');
  const hours = parts[1].replace(/^(\d+)\/(\d+)$/, '$1-23/$2');
  const dom = parts[2].replace(/^(\d+)\/(\d+)$/, '$1-31/$2');
  const month = parts[3].replace(/^(\d+)\/(\d+)$/, '$1-12/$2');
  const dow = parts[4].replace(/^(\d+)\/(\d+)$/, '$0-6/$2');

  return `${minutes} ${hours} ${dom} ${month} ${dow}`;
}

export async function prepareCronHandlers(
  classesInfo: any,
  handlers: any
): Promise<LocalEnvCronHandler[]> {
  const cronHandlers: LocalEnvCronHandler[] = [];
  for (const classElement of classesInfo) {
    const methods = classElement.methods;
    for (const method of methods) {
      if (method.type === "cron" && method.cronString) {
        const cronHandler: LocalEnvCronHandler = {
          className: classElement.className,
          methodName: method.name,
          cronString: rectifyCronString(method.cronString),
          path: handlers[classElement.className].path,
          cronObject: null,
          module: handlers[classElement.className].module
        };
        cronHandlers.push(cronHandler);
      }
    }
  }
  return cronHandlers;
}

export async function startCronHandlers(
  cronHandlers: LocalEnvCronHandler[]
): Promise<LocalEnvCronHandler[]> {
  // create cron objects
  for (const cronHandler of cronHandlers) {
    cronHandler.cronObject = cron.schedule(cronHandler.cronString, async () => {
      const reqToFunction = {
        genezioEventType: "cron",
        methodName: cronHandler.methodName,
        cronString: cronHandler.cronString
      };

      const module = cronHandler.module;

      await module.handler(reqToFunction);
    });
  }

  // start cron jobs
  for (const cronHandler of cronHandlers) {
    cronHandler.cronObject.start();
  }

  return cronHandlers;
}

export async function startLocalTesting(classesInfo: any, options: any): Promise<any> {
    const projectConfiguration = await getProjectConfiguration();

    if (projectConfiguration.classes.length === 0) {
      throw new Error("No classes found in genezio.yaml");
    }

    let astSummary: AstSummary | undefined = undefined;

    const sdk = await generateSdkRequest(projectConfiguration)

    astSummary = sdk.astSummary

    const localEnvInfo: any = await prepareForLocalEnvironment(
      projectConfiguration,
      sdk.astSummary,
      Number(options.port),
      classesInfo
    );


    classesInfo = localEnvInfo.classesInfo;
    const handlers = localEnvInfo.handlers;

    await replaceUrlsInSdk(sdk, sdk.classFiles.map((c) => ({ name: c.name, cloudUrl: `http://127.0.0.1:${options.port}/${c.name}` })))
    await writeSdkToDisk(sdk, projectConfiguration.sdk.language, projectConfiguration.sdk.path)
    reportSuccess(classesInfo, sdk);

    return({
      handlers,
      classesInfo,
      astSummary
    });
}



export async function startServer(
  classesInfo: any,
  handlers: any,
  astSummary: any,
  port = PORT_LOCAL_ENVIRONMENT
): Promise<LocalEnvStartServerOutput> {
  const app = express();
  app.use(cors());
  app.use(bodyParser.raw({ type: () => true }));
  app.use(genezioRequestParser);

  let cronHandlers: LocalEnvCronHandler[] = await prepareCronHandlers(
    classesInfo,
    handlers
  );

  cronHandlers = await startCronHandlers(cronHandlers);

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

    debugLogger.debug(`Request received for ${req.params.className}.`);

    const module = localHandler.module;
    const response = await module.handler(reqToFunction);

    handleResponseForJsonRpc(res, response);
  });

  app.all(`/:className/:methodName`, async (req: any, res: any) => {
    const reqToFunction = getEventObjectFromRequest(req);
    debugLogger.debug(`HTTP Request received ${req.method} ${req.url}.`);

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

    const module = handler.module;
    const response = await module.handler(reqToFunction);
    handleResponseforHttp(res, response);
  });

  const server = app.listen(port, () => {
    log.info(`Server listening on port ${port}`);
  });

  return {
    cronHandlers,
    server: server
  };
}

export async function prepareForLocalEnvironment(
  yamlProjectConfiguration: YamlProjectConfiguration,
  astSummary: AstSummary,
  port = PORT_LOCAL_ENVIRONMENT,
  classesInfoInput: {
    className: any;
    methods: any;
    path: string;
    functionUrl: string;
    tmpFolder: string;
  }[]
): Promise<LocalEnvInputParameters> {
  const functionUrlForFilePath: any = {};
  const handlers: any = {};
  const classesInfo: {
    className: any;
    methods: any;
    path: string;
    functionUrl: string;
    tmpFolder: string;
  }[] = [];

  const projectConfiguration = new ProjectConfiguration(
    yamlProjectConfiguration,
    astSummary
  );

  const promises = projectConfiguration.classes.map(async (element: ClassConfiguration) => {
    if (!(await fileExists(element.path))) {
      log.error(
        `\`${element.path}\` file does not exist at the indicated path.`
      );
      exit(1);
    }
    const astClassSummary = astSummary.classes.find(
      (c) => c.path === element.path
    );

    if (!astClassSummary) {
      debugLogger.debug(
        `Could not find astClassSummary for element ${element}`
      );
      return Promise.resolve();
    }

    let bundler: BundlerInterface;
    switch (element.language) {
      case ".ts": {
        bundler = new NodeTsBundler();
        break;
      }
      case ".js": {
        bundler = new NodeJsBundler();
        break;
      }
      default: {
        log.error(
          `Unsupported language ${element.language}. Skipping class ${element.path}`
        );
        return Promise.resolve();
      }
    }

    debugLogger.debug(
      `The bundling process has started for file ${element.path}...`
    );
    const tmpFolder = classesInfoInput.find((c) => c.path === element.path)?.tmpFolder || await createTemporaryFolder();
    return bundler
      .bundle({
        configuration: element,
        path: element.path,
        extra: { mode: "development", tmpFolder: tmpFolder }
      })
      .then((output) => {
        debugLogger.debug("The bundling process finished successfully.");
        const className = astClassSummary.name;
        const handlerPath = path.join(output.path, "index.js");
        const baseurl = `http://127.0.0.1:${port}/`;
        const functionUrl = `${baseurl}${className}`;
        functionUrlForFilePath[path.parse(element.path).name] = functionUrl;

        const methods =
          astClassSummary?.methods.map((m: AstSummaryMethod) => {
            return {
              ...m,
              cronString:
                element.methods.find((e: any) => e.name === m.name)
                  ?.cronString || null
            };
          }) || [];

        classesInfo.push({
          className: className,
          methods: methods,
          path: element.path,
          functionUrl: baseurl,
          tmpFolder: tmpFolder
        });

        // eslint-disable-next-line @typescript-eslint/no-var-requires
        delete require.cache[require.resolve(handlerPath)]
        delete require.cache[require.resolve(path.join(path.dirname(handlerPath), "module.js"))]

        handlers[className] = {
          path: handlerPath,
          module: require(handlerPath)
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
