import log from "loglevel";
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

export async function bundle(
    projectConfiguration: ProjectConfiguration,
    ast: Program,
    element: ClassConfiguration,
    installDeps: boolean = true,
): Promise<BundlerOutput> {
    if (!(await fileExists(element.path))) {
        printAdaptiveLog("Bundling your code and uploading it", "error");
        log.error(`\`${element.path}\` file does not exist at the indicated path.`);

        throw new Error(`\`${element.path}\` file does not exist at the indicated path.`);
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
            throw new Error(`Unsupported ${element.language}`);
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
        },
    });
    debugLogger.debug(`The bundling process finished successfully for file ${element.path}.`);
    return output;
}
