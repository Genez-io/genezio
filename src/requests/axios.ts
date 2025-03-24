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
    Forbidden = 9,
}

axios.interceptors.response.use(
    function (response) {
        // Do something with response data
        return response;
    },
    function (error: AxiosError<StatusError>) {
        const response = error.response;
        if (!response) {
            throw error;
        }

        if (response.status === 402) {
            throw new UserError(
                "You need to upgrade your account to use this feature. Please visit the billing page in the dashboard: https://app.genez.io/billing",
            );
        }
        if (!response.data.error) {
            throw new UserError(
                "There was an error on our end. Please try again! If the problem persists, please report it to our issues page on GitHub: https://github.com/Genez-io/genezio/issues",
            );
        }
        if (response.data.error.code === GenezioErrorCode.UpdateRequired) {
            throw new UserError("Please update your genezio CLI. Run 'npm update -g genezio'.");
        }
        if (response.data.error.code === GenezioErrorCode.Unauthorized) {
            throw new UserError(GENEZIO_NOT_AUTH_ERROR_MSG);
        }
        if (response.data.error.code === GenezioErrorCode.NotFoundError) {
            throw new UserError("The project you are looking for does not exist.");
        }
        if (
            response.data.error.code === GenezioErrorCode.Forbidden &&
            response.data.error.message === "Forbidden"
        ) {
            throw new UserError(
                "This action is forbidden. Check your permissions in the dashboard: https://app.genez.io.",
            );
        }

        debugLogger.debug("Axios error received:", JSON.stringify(response.data.error));

        if (response.data.status === "error") {
            throw new UserError(response.data.error.message);
        }

        throw new UserError("An unknown error occurred. Please file a bug report.");
    },
);

export default axios;
