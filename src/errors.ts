// Constant strings used for output/error messages
export const GENEZIO_NOT_AUTH_ERROR_MSG =
    "You are not logged in or your token is invalid. Please run `genezio login` before running this command.";
export const PORT_ALREADY_USED = function (port: number) {
    return `The port ${port} is already in use. Please use a different port by specifying --port <port> to start your local server.`;
};
export const GENEZIO_NO_CLASSES_FOUND =
    "You don't have any class in specified in the genezio.yaml configuration file. Add a class with 'genezio addClass <className> <classType>' field and then call again 'genezio deploy'.";
export const GENEZIO_DART_NOT_FOUND = `
Error: Dart not found

Please ensure that Dart is installed and its binary is added to your system's PATH environment variable. You can download and install Dart from the official website: https://dart.dev/get-dart. Once installed, try running the command again.
`;
export const GENEZIO_DARTAOTRUNTIME_NOT_FOUND = `
Error: \`dartaotruntime\` not found

Please ensure that \`dartaotruntime\` is installed and its binary is added to your system's PATH environment variable. Check the Dart documentation for more information: https://dart.dev/get-dart.`;
export const GENEZIO_NO_SUPPORT_FOR_OPTIONAL_DART = `We don't currently support Optional types. We will soon add support for this feature.`;

export const GENEZIO_NO_SUPPORT_FOR_BUILT_IN_TYPE = `Our AST doesn't currently support this specific Dart built-in type. Check the documentation for more details https://genezio.com/docs/programming-languages/dart\n\nPlease add a Github issue to https://github.com/Genez-io/genezio/issues describing your use case for this type or feel free to contribute yourself with an improvement.`;

export const GENEZIO_NOT_ENOUGH_PERMISSION_FOR_FILE = function (filePath: string) {
    return `You don't have enough permissions to access the file ${filePath}. There are two possible solutions:\n1. Add the ${filePath} file to .genezioignore file.\n2. Please adjust the permissions of the file located at ${filePath} to ensure the 'genezio' process has the appropriate access rights.\n`;
};

export const GENEZIO_GIT_NOT_FOUND = `Git is not installed. Please install it and try again.
https://git-scm.com/book/en/v2/Getting-Started-Installing-Git`;
