import { UserError } from "../errors.js";
import {
    AwsFunctionHandlerProvider,
    AwsPythonFunctionHandlerProvider,
} from "../functionHandlerProvider/providers/AwsFunctionHandlerProvider.js";
import { HttpServerHandlerProvider } from "../functionHandlerProvider/providers/HttpServerHandlerProvider.js";
import { FunctionType, Language } from "../projectConfiguration/yaml/models.js";

export function getFunctionHandlerProvider(
    functionType: FunctionType,
    language: Language,
): AwsFunctionHandlerProvider | HttpServerHandlerProvider {
    switch (functionType) {
        case FunctionType.aws: {
            const providerMap: { [key: string]: AwsFunctionHandlerProvider } = {
                [`${FunctionType.aws}-${Language.python}`]: new AwsPythonFunctionHandlerProvider(),
                [`${FunctionType.aws}-${Language.js}`]: new AwsFunctionHandlerProvider(),
                [`${FunctionType.aws}-${Language.ts}`]: new AwsFunctionHandlerProvider(),
            };

            const key = `${functionType}-${language}`;
            const provider = providerMap[key];

            if (provider) {
                return provider;
            } else {
                throw new UserError(
                    `Unsupported language: ${language} for AWS function. Supported languages are: python, js, ts.`,
                );
            }
        }
        case FunctionType.httpServer:
            return new HttpServerHandlerProvider();
        default:
            throw new UserError(
                `Unsupported function type: ${functionType}. Supported providers are: aws, httpServer.`,
            );
    }
}
