import { NormalModule } from "webpack";
import { ClassConfiguration, ProjectConfiguration } from "../models/projectConfiguration";
import { Program } from "../models/genezioModels";

/**
 * The input that goes into the bundler.
 */
export type BundlerInput = {
    projectConfiguration: ProjectConfiguration,
    configuration: ClassConfiguration,
    // The path to the source code file that should be bundled.
    path: string,
    ast: Program,
    genezioConfigurationFilePath: string,
    extra: {
        originalPath?: string,
        mode: "production" | "development",
        tmpFolder?: string,
        dependenciesInfo?: Dependency[],
        startingCommand?: string
        commandParameters?: string[]
    }
}

/**
 * The output that comes out of the bundler.
 */
export type BundlerOutput = BundlerInput

/**
 * A class implementing this interface will bundle the source code files together with all the required dependencies
 * and will return a path to a folder where the final result can be found.
 */
export interface BundlerInterface {
    bundle: (input: BundlerInput) => Promise<BundlerOutput>
}

export interface Dependency {
    name: string,
    path: string
}
