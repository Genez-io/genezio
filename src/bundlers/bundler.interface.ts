import { ClassConfiguration } from "../models/projectConfiguration";
import webpack, { NormalModule } from "webpack";

/**
 * The input that goes into the bundler.
 */
export type BundlerInput = {
    configuration: ClassConfiguration
    // The path to the source code file that should be bundled.
    path: string
    extra?: { [id: string]: any; }
}

/**
 * The output that comes out of the bundler.
 */
export type BundlerOutput = {
    configuration: ClassConfiguration
    // Path to a folder containing the source code bundled.
    path: string
    extra?: { [id: string]: any; }
}

/**
 * A class implementing this interface will bundle the source code files together with all the required dependencies
 * and will return a path to a folder where the final result can be found.
 */
export interface BundlerInterface {
    bundle: (input: BundlerInput) => Promise<BundlerOutput>
}

export class AccessDependenciesPlugin {
    dependencies: string[];

    // constructor() {
    constructor(dependencies: string[]) {
        this.dependencies = dependencies;
    }

    apply(compiler: {
        hooks: {
            compilation: {
                tap: (arg0: string, arg1: (compilation: any) => void) => void;
            };
        };
    }) {
        compiler.hooks.compilation.tap(
            "AccessDependenciesPlugin",
            (compilation) => {
                NormalModule.getCompilationHooks(compilation).beforeLoaders.tap(
                    "AccessDependenciesPlugin",
                    (loader: any, normalModule: any) => {
                        if (
                            normalModule.resource &&
                            normalModule.resource.includes("node_modules")
                        ) {
                            const resource = normalModule.resource;
                            this.dependencies.push(resource);
                        }
                    }
                );
            }
        );
    }
}
