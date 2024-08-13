import sendRequest from "../utils/requests.js";

export type CreateFunctionRequest = {
    projectName: string;
    stageName: string;
    function: {
        name: string;
        language: string;
        entryFile: string;
    };
};

export type CreateFunctionResponse = {
    status: string;
    functionId: string;
};

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
