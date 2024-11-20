import { CreateFunctionRequest, CreateFunctionResponse } from "../models/requests.js";
import sendRequest from "../utils/requests.js";

export async function createFunction(
    request: CreateFunctionRequest,
): Promise<CreateFunctionResponse> {
    const {
        projectName,
        stageName,
        function: { name, language, entryFile },
    } = request;

    const data: string = JSON.stringify({
        projectName: projectName,
        stageName: stageName,
        function: {
            name: name,
            language: language,
            entryFile: entryFile,
        },
    });

    const createFunctionResponse = (await sendRequest(
        "POST",
        "functions",
        data,
    )) as CreateFunctionResponse;

    return createFunctionResponse;
}
