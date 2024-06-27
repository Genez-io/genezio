import { FunctionConfiguration } from "../models/projectConfiguration.js";

export interface FunctionHandlerProvider {
    getHandler(functionConfiguration: FunctionConfiguration): Promise<string>;
    writeAdditionalFiles(path: string): Promise<void>;
}
