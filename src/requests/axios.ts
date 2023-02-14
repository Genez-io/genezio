import axios from 'axios';

enum GenezioErrorCode {
	UnknownError = 0,
	Unauthorized = 1,
	NotFoundError = 2,
	InternalServerError = 3,
	MethodNotAllowedError = 4,
	MissingRequiredParametersError = 5,
	BadRequest = 6,
	StatusConflict = 7,
	UpdateRequired = 8
  }

axios.interceptors.response.use(function (response) {
    // Do something with response data
    return response;
}, function (error) {
    if (error.response.data.error.code === GenezioErrorCode.UpdateRequired) {
        throw new Error("Please update your genezio CLI. Run 'npm update -g genezio'.")
    }
    // Do something with response error
    return Promise.reject(error);
});

export default axios;