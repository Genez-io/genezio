import log from "loglevel";
import { ModuleOptions, StatsError, webpack } from "webpack";

export function bundle(
  entryFilePath: string,
  mode: "none" | "development" | "production",
  externals: any[],
  module: ModuleOptions | undefined,
  plugins: any[] | undefined,
  outputPath: string,
  outputFile: string,
  _resolve?: any,
  resolveLoader?: any
): Promise<StatsError[] | undefined> {
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
        resolve(stats?.toJson().errors);

        // exit(1);
      }

      compiler.close((closeErr) => {
        /* TODO: handle error? */
      });

      resolve(undefined);
    });
  });
}
