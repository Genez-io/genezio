import { createRequire } from 'module';
import path from "path";
import stripDecorator from './stripDecoratorsPlugin.js';
import babel from '@babel/core'

export default async function (fileData: string): Promise<string> {
    const require = createRequire(import.meta.url);
    const packagePath = path.dirname(require.resolve("@babel/plugin-syntax-decorators"));

    const babelOutput = await babel.transformAsync(fileData, {
        plugins: [
            [packagePath, { version: "2023-05", decoratorsBeforeExport: false}],
            stripDecorator,
        ]
   });

    if (!babelOutput?.code) {
        throw new Error("Error while transforming decorators!")
    }

    return babelOutput.code
}
