import { FunctionConfiguration } from "../../models/projectConfiguration.js";
import { FunctionHandlerProvider } from "../functionHandlerProvider.js";

export class AwsFunctionHandlerProvider implements FunctionHandlerProvider {
    async getHandler(functionConfiguration: FunctionConfiguration): Promise<string> {
        return `handler ${functionConfiguration.handler}`;
    }
}
