// Constant strings used for output/error messages
export const GENEZIO_NOT_AUTH_ERROR_MSG = "You are not logged in or your token is invalid. Please run `genezio login` before running this command."
export const PORT_ALREADY_USED = function(port: number) {
    return `The port ${port} is already in use. Please use a different port by specifying --port <port> to start your local server.`
}
export const GENEZIO_NO_CLASSES_FOUND = "No classes found in genezio.yaml";
