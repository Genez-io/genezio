import { BundlerInterface } from "./bundler.interface";
import { NodeJsBundler } from "./nodeJsBundler";

export class BundlerFactory {
    create(languageExtension: string): BundlerInterface|undefined {
        switch(languageExtension) {
            case ".js":
                return new NodeJsBundler()
        }
    }
}