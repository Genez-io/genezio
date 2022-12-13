const environment = process.env.NODE_ENV

declare let REACT_APP_BASE_URL: string;
let BACKEND_ENDPOINT: string;
let GENERATE_SDK_API_URL: string;
let PORT_LOCAL_ENVIRONMENT: number;

if (environment === "dev") {
    REACT_APP_BASE_URL = "https://dev.app.genez.io";
    BACKEND_ENDPOINT = "https://dev.api.genez.io";
    GENERATE_SDK_API_URL = "https://dev-sdk-api.genez.io";
    PORT_LOCAL_ENVIRONMENT = 8083;
} else {
    REACT_APP_BASE_URL = "https://app.genez.io";
    BACKEND_ENDPOINT = "https://api.genez.io";
    GENERATE_SDK_API_URL = "https://sdk-api.genez.io";
    PORT_LOCAL_ENVIRONMENT = 8083;
}

export { REACT_APP_BASE_URL, BACKEND_ENDPOINT, GENERATE_SDK_API_URL, PORT_LOCAL_ENVIRONMENT };
