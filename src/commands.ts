import webpack from 'webpack'
import path from 'path'
import deployCode from "./requests/deployCode"
import generateSdk from "./requests/generateSdk"
import { createTemporaryFolder, fileExists, getFileDetails, readUTF8File, writeToFile } from "./utils/file"
import { askQuestion } from './utils/prompt'
import BundledCode from './models/bundledCode'
import { parse, Document } from 'yaml'


export async function bundleJavascriptCode(filePath: string): Promise<BundledCode> {
  return new Promise(async (resolve, reject) => {
    const { name } = getFileDetails(filePath)
    const outputFile = `${name}-processed.js`
    const temporaryFolder = await createTemporaryFolder(filePath)

    const compiler = webpack({
      entry: "./" + filePath,
      target: 'node',
      mode: 'production',
      node: false,
      optimization: {
        minimize: false,
      },
      module: {
        rules: [
          {
            test: /\.html$/,
            loader: 'dumb-loader',
            exclude: /really\.html/
          }
        ]
      },
      output: {
        path: temporaryFolder,
        filename: outputFile,
        library: 'genezio',
        libraryTarget: 'commonjs'
      },
    })

    compiler.run((error, stats) => {
      if (error) {
        reject(error)
        return;
      }

      if (stats?.hasErrors()) {
        reject(stats?.compilation.getErrors())
        return;
      }

      const filePath = path.join(temporaryFolder, outputFile)
      const module = require(filePath);
      const className = Object.keys(module.genezio)[0]
      const functionNames = Object.getOwnPropertyNames(module.genezio[className].prototype).filter(x => x !== 'constructor')

      resolve(new BundledCode(filePath, className, functionNames))

      compiler.close((closeErr) => { /* TODO: handle error? */ })
    })
  })
}

async function deployFunction(filePath: string, language: string, sdkPath: string, runtime: string) {
  if (!await fileExists(filePath)) {
    throw new Error(`File ${filePath} does not exist!`)
  }

  const { name, extension, filename } = getFileDetails(filePath)

  switch (extension) {
    case ".js":
      const bundledJavascriptCode = await bundleJavascriptCode(filePath)

      const functionUrl = await deployCode(bundledJavascriptCode, filePath, extension, runtime)

      if (!functionUrl) {
        console.error("A problem occured while contacting Genezio servers. Check your internet connection and try again!")
        return;
      }

      return functionUrl
    default:
      throw new Error(`Language represented by extension ${extension} is not supported!`)
  }
}

export async function deployFunctions() {
  const configurationFileContentUTF8 = await readUTF8File('./genezio.yaml')
  const configurationFileContent = await parse(configurationFileContentUTF8);

  const functionUrlForFilePath: any = {}

  for (const filePath of configurationFileContent.classPaths) {
    const functionUrl = await deployFunction(
      filePath,
      configurationFileContent.sdk.language,
      configurationFileContent.sdk.path,
      configurationFileContent.sdk.runtime
    )

    functionUrlForFilePath[path.parse(filePath).name] = functionUrl
  }

  await generateSdks(functionUrlForFilePath)

  console.log('Your code was deployed and the SDK was successfully generated!')
}

export async function generateSdks(urlMap?: any) {
  const configurationFileContentUTF8 = await readUTF8File('./genezio.yaml')
  const configurationFileContent = await parse(configurationFileContentUTF8);
  const outputPath = configurationFileContent.sdk.path
  const sdk = await generateSdk(configurationFileContent.classPaths, configurationFileContent.sdk.runtime, urlMap)

  if (sdk.remoteFile) {
    await writeToFile(outputPath, 'remote.js', sdk.remoteFile, true)
      .catch((error) => {
        console.error(error.toString())
      })
  }

  for (const classFile of sdk.classFiles) {
    await writeToFile(outputPath, `${classFile.filename}.sdk.js`, classFile.implementation, true)
     .catch((error) => {
        console.error(error.toString())
      })
  }
}

export async function init() {
  const projectName = await askQuestion(`What is the name of the project: `)
  const sdk: any = { name: projectName, sdk: {}, classPaths: [] }

  const language = await askQuestion(`In what programming language do you want your SDK? [js]: `, 'js')

  if (language !== "js") {
    throw Error(`We don't currently support this language ${language}.`)
  }
  sdk.sdk.language = language

  if (language === "js") {
    const runtime = await askQuestion(`What runtime will you use? Options: "node" or "browser". [node]: `, 'node')
    if (runtime !== "node" && runtime !== "browser") {
      throw Error(`We don't currently support this JS runtime ${runtime}.`)
    }

    sdk.sdk.runtime = runtime;
  }

  const path = await askQuestion(`Where do you want to save your SDK? [./sdk/]: `, './sdk/');
  sdk.sdk.path = path

  const doc = new Document(sdk)
  doc.commentBefore = `File that configures what classes will be deployed in Genezio Infrastructure. 
Add the paths to classes that you want to deploy in "classPaths".

Example:

name: hello-world
sdk:
  language: js
  runtime: node
  path: ./sdk/
classPaths:
  - "./hello-world/index.js"`

  const yamlConfigurationFileContent = doc.toString();

  await writeToFile('.', 'genezio.yaml', yamlConfigurationFileContent)
    .catch((error) => {
      console.error(error.toString())
    })
}