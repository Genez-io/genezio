const environment = process.env.NODE_ENV

let REACT_APP_BASE_URL: string;
let BACKEND_ENDPOINT: string;
let FRONTEND_DOMAIN: string;
let PORT_LOCAL_ENVIRONMENT: number;
let LOCAL_TEST_INTERFACE_URL: string;
let ENABLE_DEBUG_LOGS_BY_DEFAULT: boolean;

if (environment === "dev") {
    REACT_APP_BASE_URL = "https://dev.app.genez.io";
    FRONTEND_DOMAIN = "dev.app.genez.io";
    BACKEND_ENDPOINT = "http://127.0.0.1:8080";
    LOCAL_TEST_INTERFACE_URL = "https://dev.app.genez.io/test-interface/local";
    PORT_LOCAL_ENVIRONMENT = 8083;
    ENABLE_DEBUG_LOGS_BY_DEFAULT = true;
} else {
    REACT_APP_BASE_URL = "https://app.genez.io";
    FRONTEND_DOMAIN = "app.genez.io";
    BACKEND_ENDPOINT = "https://api.genez.io";
    LOCAL_TEST_INTERFACE_URL = "https://app.genez.io/test-interface/local";
    PORT_LOCAL_ENVIRONMENT = 8083;
    ENABLE_DEBUG_LOGS_BY_DEFAULT = false;
}

export { REACT_APP_BASE_URL, FRONTEND_DOMAIN, BACKEND_ENDPOINT, PORT_LOCAL_ENVIRONMENT, ENABLE_DEBUG_LOGS_BY_DEFAULT, LOCAL_TEST_INTERFACE_URL };
