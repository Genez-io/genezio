import axios, { AxiosError } from "axios";
import { debugLogger } from "../utils/logging.js";
import { StatusError } from "./models.js";
import { GENEZIO_NOT_AUTH_ERROR_MSG, UserError } from "../errors.js";

enum GenezioErrorCode {
    UnknownError = 0,
    Unauthorized = 1,
    NotFoundError = 2,
    InternalServerError = 3,
    MethodNotAllowedError = 4,
    MissingRequiredParametersError = 5,
    BadRequest = 6,
    StatusConflict = 7,
    UpdateRequired = 8,
}

axios.interceptors.response.use(
    function (response) {
        // Do something with response data
        return response;
    },
    function (error: AxiosError<StatusError>) {
        const response = error.response;
        if (!response) {
            throw new UserError("There was an error connecting to the server.");
        }

        if (response.status === 402) {
            throw new UserError(
                "You've hit the maximum number of projects. To continue, please upgrade your subscription.",
            );
        }
        if (response.data.error.code === GenezioErrorCode.UpdateRequired) {
            throw new UserError("Please update your genezio CLI. Run 'npm update -g genezio'.");
        }
        if (response.data.error.code === GenezioErrorCode.Unauthorized) {
            throw new UserError(GENEZIO_NOT_AUTH_ERROR_MSG);
        }

        debugLogger.debug("Axios error received:", JSON.stringify(response.data.error));

        if (response.data.status === "error") {
            throw new UserError(response.data.error.message);
        }

        throw new UserError("An unknown error occurred. Please file a bug report.");
    },
);

export default axios;
