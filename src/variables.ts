const environment = process.env.NODE_ENV

let REACT_APP_BASE_URL: string;
let BACKEND_ENDPOINT: string;
let FRONTEND_DOMAIN: string;
let GENERATE_SDK_API_URL: string;
let PORT_LOCAL_ENVIRONMENT: number;
let ENABLE_DEBUG_LOGS_BY_DEFAULT: boolean;

if (environment === "dev") {
    REACT_APP_BASE_URL = "https://dev.app.genez.io";
    FRONTEND_DOMAIN = "dev.app.genez.io";
    BACKEND_ENDPOINT = "http://localhost:8080";
    GENERATE_SDK_API_URL = "https://dev-sdk-api.genez.io";
    PORT_LOCAL_ENVIRONMENT = 8083;
    ENABLE_DEBUG_LOGS_BY_DEFAULT = true;
} else {
    REACT_APP_BASE_URL = "https://app.genez.io";
    FRONTEND_DOMAIN = "app.genez.io";
    BACKEND_ENDPOINT = "https://api.genez.io";
    GENERATE_SDK_API_URL = "https://sdk-api.genez.io";
    PORT_LOCAL_ENVIRONMENT = 8083;
    ENABLE_DEBUG_LOGS_BY_DEFAULT = false;
}

export { REACT_APP_BASE_URL, FRONTEND_DOMAIN, BACKEND_ENDPOINT, GENERATE_SDK_API_URL, PORT_LOCAL_ENVIRONMENT, ENABLE_DEBUG_LOGS_BY_DEFAULT };
