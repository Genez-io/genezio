import { bundleJavascriptCode } from "./commands";
import http from "http";
import Handler from "./models/handler";
import {
  createTemporaryFolder,
  getAllNonJsFiles,
  readUTF8File,
  writeToFile
} from "./utils/file";
import { parse } from "yaml";
import { createHttpTerminator } from "http-terminator";
import path from "path";
import fs from "fs";
import { lambdaHandler } from "./utils/lambdaHander";
import fsExtra, { remove } from "fs-extra";
import querystring from "querystring";
import jsonBody from "body/json";
import { PORT_LOCAL_ENVIRONMENT } from "./variables";
import { exit } from "process";

export default class Server {
  server: http.Server;
  handlers: any = {};
  activeStatus = false;

  constructor() {
    this.server = http.createServer();
  }

  async createLocalEnvironmentFolderForOneClass(
    filePath: string
  ): Promise<any> {
    // eslint-disable-next-line no-async-promise-executor
    return new Promise(async (resolve, reject) => {
      const allNonJsFilesPaths = await getAllNonJsFiles();
      const bundledJavascriptCode = await bundleJavascriptCode(filePath);

      const jsBundlePath = bundledJavascriptCode.path;
      const dependenciesInfo: any = bundledJavascriptCode.dependencies;
      const functionNames = bundledJavascriptCode.functionNames;

      const tmpPath = await createTemporaryFolder("genezio-");

      // check if the tmp folder exists
      if (!fs.existsSync(tmpPath)) {
        fs.mkdirSync(tmpPath, { recursive: true });
      }

      writeToFile(tmpPath, "index.js", lambdaHandler);

      // create file structure
      const jsBundleFile = path.join(tmpPath, "module.js");

      // create js bundle file in tmp folder from bundledJavascriptCode path
      fs.copyFileSync(jsBundlePath, jsBundleFile);

      // iterare over all non js files and copy them to tmp folder
      allNonJsFilesPaths.forEach((filePath, key) => {
        // get folders array
        const folders = filePath.path.split(path.sep);
        // remove file name from folders array
        folders.pop();
        // create folder structure in tmp folder
        const folderPath = path.join(tmpPath, ...folders);
        if (!fs.existsSync(folderPath)) {
          fs.mkdirSync(folderPath, { recursive: true });
        }
        // copy file to tmp folder
        const fileDestinationPath = path.join(tmpPath, filePath.path);
        fs.copyFileSync(filePath.path, fileDestinationPath);
      });

      // create node_modules folder in tmp folder
      const nodeModulesPath = path.join(tmpPath, "node_modules");
      if (!fs.existsSync(nodeModulesPath)) {
        fs.mkdirSync(nodeModulesPath, { recursive: true });
      }

      // copy all dependencies to node_modules folder
      for (const dependency of dependenciesInfo) {
        const dependencyPath = path.join(nodeModulesPath, dependency.name);
        fsExtra.copySync(dependency.path, dependencyPath);
      }

      resolve({ folderClassPath: tmpPath, functionNames: functionNames });
    });
  }

  async generateHandlersFromFiles(): Promise<any> {
    // eslint-disable-next-line no-async-promise-executor
    return new Promise(async (resolve, reject) => {
      // delete all tmp folders of handler

      // iterate all the objet keys of handlers
      for (const handlerKey of Object.keys(this.handlers)) {
        // get handler
        const handler = this.handlers[handlerKey];
        // delete tmp folder
        fs.rmSync(handler.path, { recursive: true, force: true });
      }

      this.handlers = {};

      const configurationFileContentUTF8 = await readUTF8File("./genezio.yaml");
      const configurationFileContent = await parse(
        configurationFileContentUTF8
      );

      let hasClasses = false;

      const classes = [];

      for (const classElem of configurationFileContent.classes) {
        hasClasses = true;
        const { folderClassPath, functionNames } =
          await this.createLocalEnvironmentFolderForOneClass(classElem.path);

        const module = require(path.join(folderClassPath, "module.js")); // eslint-disable-line @typescript-eslint/no-var-requires

        const className = Object.keys(
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          module.genezio
        )[0];
        classes.push({
          fileName: path.parse(classElem.path).name,
          className: className
        });

        this.handlers[className] = new Handler(
          folderClassPath,
          module,
          className,
          functionNames
        );
      }

      if (hasClasses) {
        resolve(classes);
      } else {
        resolve(false);
      }
    });
  }

  async start() {
    this.activeStatus = true;
    this.server = http.createServer((req, res) => {
      jsonBody(req, res, async (err: any, body: any) => {
        try {
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.setHeader("Access-Control-Allow-Headers", "Content-Type");
          res.setHeader("Access-Control-Allow-Methods", "POST");
          if (req.method === "OPTIONS") {
            res.writeHead(200);
            res.end();
            return;
          }

          if (req.url === "/") {
            res.writeHead(404);
            res.end();
            return;
          }

          const components = req.url?.split("/");
          if (components == undefined || components?.length < 2) {
            res.writeHead(404);
            res.end();
            return;
          }

          const pathClassName = components?.[1];

          if (!pathClassName) {
            res.writeHead(404);
            res.end();
            return;
          }

          if (components?.length > 2) {
            // handler for webhooks
            const pathMethodName = components?.[2];
            if (!pathMethodName) {
              res.writeHead(404);
              res.end();
              return;
            }

            const handler = this.handlers[pathClassName];
            if (!handler) {
              res.writeHead(404);
              res.end();
              return;
            }

            const reqToFunction = {
              headers: req.headers,
              http: {
                // get path without the className
                path: req.url?.replace(`/${pathClassName}`, ""),
                protocol: req.httpVersion,
                method: req.method,
                sourceIp: req.socket.remoteAddress,
                userAgent: req.headers["user-agent"]
              },
              queryParameters: req.url!.includes("?")
                ? querystring.parse(req.url!.split("?")[1])
                : {},
              timeEpoch: Date.now(),
              body: JSON.stringify(body)
            };

            const object = new handler.object.genezio[
              Object.keys(handler.object.genezio)[0]
            ]();

            console.log(
              `HTTP request received for ${pathMethodName} on class ${pathClassName}\n`
            );

            try {
              const response = await object[pathMethodName](reqToFunction);

              if (response.statusDescription) {
                res.statusMessage = response.statusDescription;
              }
              if (response.headers) {
                for (const header of Object.keys(response.headers)) {
                  res.setHeader(header, response.headers[header]);
                }
              }

              if (response.statusCode) {
                res.writeHead(parseInt(response.statusCode));
              }

              if (response.bodyEncoding === "base64") {
                res.write(Buffer.from(response.body, "base64"));
              } else {
                res.end(response.body ? response.body : "");
              }
            } catch (error) {
              res.writeHead(500);
              res.end();
              return;
            }
          } else {
            // handler for jsonrpc
            const [_, method] = body.method.split(".");
            const handler = this.handlers[pathClassName];
            if (!handler) {
              res.writeHead(404);
              res.end();
              return;
            }

            console.log(
              "Invoking method ",
              method,
              " on class ",
              pathClassName + "\n"
            );

            const object = new handler.object.genezio[
              Object.keys(handler.object.genezio)[0]
            ]();

            const requestId = body.id;
            try {
              const response = await object[method](...(body.params || []));
              res.setHeader("Content-Type", "application/json");
              res.writeHead(200);
              return res.end(
                JSON.stringify({
                  jsonrpc: "2.0",
                  result: response,
                  error: null,
                  id: requestId
                })
              );
            } catch (error: any) {
              const response = {
                jsonrpc: "2.0",
                error: { code: -1, message: error.toString() },
                id: requestId
              };
              res.setHeader("Content-Type", "application/json");
              res.writeHead(200);
              return res.end(JSON.stringify(response));
            }
          }
        } catch (error: any) {
          res.writeHead(500);
          res.end(error.toString());
        }
      });
    });

    console.log("");
    console.log("Classes registered:");
    Object.keys(this.handlers).forEach((handlerName) => {
      const handler = this.handlers[handlerName];
      console.log(`  - ${handler.className}`);
      for (const functionName of handler.functionNames) {
        console.log(
          `     ${functionName} - http://127.0.0.1:${PORT_LOCAL_ENVIRONMENT}/${handler.className}/${functionName}`
        );
      }
      console.log("");
    });
    console.log("");
    console.log("Listening for requests...");
    this.server.listen(PORT_LOCAL_ENVIRONMENT).on("error", (err: any) => {
      if (err.code === "EADDRINUSE") {
        console.log(
          "Port " +
            PORT_LOCAL_ENVIRONMENT +
            " is already in use. Please close the process using it."
        );
        exit(1);
      }
    });
  }

  async terminate() {
    const httpTerminator = createHttpTerminator({ server: this.server });
    this.activeStatus = false;
    await httpTerminator.terminate();
  }

  isRunning() {
    return this.activeStatus;
  }
}
