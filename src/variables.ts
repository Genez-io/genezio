const environment = process.env.NODE_ENV

let REACT_APP_BASE_URL: string;
let BACKEND_ENDPOINT: string;
let FRONTEND_DOMAIN: string;
let GENERATE_SDK_API_URL: string;
let PORT_LOCAL_ENVIRONMENT: number;
let LOCAL_TEST_INTERFACE_URL: string;
let ENABLE_DEBUG_LOGS_BY_DEFAULT: boolean;
let PUPPETEER_DATA_DIR: string;

if (environment === "dev") {
    REACT_APP_BASE_URL = "https://dev.app.genez.io";
    FRONTEND_DOMAIN = "dev.app.genez.io";
//    BACKEND_ENDPOINT = "https://dev.api.genez.io";
	BACKEND_ENDPOINT = "http://127.0.0.1:8080";
    GENERATE_SDK_API_URL = "https://dev-sdk-api.genez.io";
    LOCAL_TEST_INTERFACE_URL = "https://dev.app.genez.io/test-interface/local";
    PORT_LOCAL_ENVIRONMENT = 8083;
    ENABLE_DEBUG_LOGS_BY_DEFAULT = true;
    // Needed by the alternate login method. You can get your by entering "chrome://version"
    // in your chromium-based browser. The path is under "Profile Path". Remove the `/Default` part.
    PUPPETEER_DATA_DIR = "/home/ghidorah/.config/google-chrome";
    //PUPPETEER_DATA_DIR = "C:\\Users\\Administrator\\AppData\\Local\\Google\\Chrome\\User Data";
} else {
    REACT_APP_BASE_URL = "https://app.genez.io";
    FRONTEND_DOMAIN = "app.genez.io";
    BACKEND_ENDPOINT = "https://api.genez.io";
    GENERATE_SDK_API_URL = "https://sdk-api.genez.io";
    LOCAL_TEST_INTERFACE_URL = "https://app.genez.io/test-interface/local";
    PORT_LOCAL_ENVIRONMENT = 8083;
    ENABLE_DEBUG_LOGS_BY_DEFAULT = false;
}

export { REACT_APP_BASE_URL, FRONTEND_DOMAIN, BACKEND_ENDPOINT, GENERATE_SDK_API_URL, PORT_LOCAL_ENVIRONMENT, ENABLE_DEBUG_LOGS_BY_DEFAULT, LOCAL_TEST_INTERFACE_URL, PUPPETEER_DATA_DIR };
