import { BundlerInput, BundlerInterface, BundlerOutput } from "../bundler.interface.js";
import { fileExists } from "../../utils/file.js";
import { DependencyInstaller } from "./dependencyInstaller.js";

// Ensures that all dependencies required by the Typescript compiler are installed.
export class TsRequiredDepsBundler implements BundlerInterface {

    async bundle(input: BundlerInput): Promise<BundlerOutput> {
        const exists = await fileExists("node_modules/@types/node")

        // Install @types/node for typescript if it is not already installed
        if (!exists) {
          await new DependencyInstaller().install(["@types/node"], true);
        }

        return input;
    }
}