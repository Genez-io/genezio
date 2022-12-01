import { ModuleOptions, webpack } from "webpack";
import log from "loglevel"

export function bundle(
    entryFilePath: string,
    mode: "none" | "development" | "production",
    externals: any[],
    module: ModuleOptions|undefined,
    plugins: any[]|undefined,
    outputPath: string,
    outputFile: string,
    _resolve?: any,
    resolveLoader?: any): Promise<void> {
    return new Promise((resolve, reject) => {
        const compiler = webpack({
            entry: entryFilePath,
            target: "node",
            cache: true,
            externals: externals,
            mode,
            node: false,
            module,
            resolve: _resolve,
            resolveLoader,
            plugins: plugins,
            // compilation stats json
            output: {
                path: outputPath,
                filename: outputFile,
                library: "genezio",
                libraryTarget: "commonjs"
            }
        });

        compiler.run(async (error, stats) => {
            if (error) {
                console.error(error);
                reject(error);
                return;
            }

            if (stats?.hasErrors()) {
                stats?.compilation.getErrors().forEach((error) => {
                    log.error(error.message)
                });
                reject(stats?.compilation.getErrors());
                return;
            }

            compiler.close((closeErr) => {
                /* TODO: handle error? */
            });

            resolve();
        });
    });
}