let environment: string = "prod"

let DASHBOARD_URL: string;
let BACKEND_ENDPOINT: string;
let FRONTEND_DOMAIN: string;
let PORT_LOCAL_ENVIRONMENT: number;
let LOCAL_TEST_INTERFACE_URL: string;
let DART_COMPILATION_ENDPOINT: string;
let ENABLE_DEBUG_LOGS_BY_DEFAULT: boolean;
let ENVIRONMENT: string;
let SENTRY_DSN: string;
let GENEZIO_REGISTRY: string;
let REQUIRED_GENEZIO_TYPES_VERSION_RANGE: string;
let RECOMMENTDED_GENEZIO_TYPES_VERSION_RANGE: string;

const GENEZIO_TELEMETRY_ENDPOINT =
    "https://c4h2bia7gbokqdxxc6fe5sgj5e0imchy.lambda-url.us-east-1.on.aws/";
const NODE_MINIMUM_VERSION: string = "18.2.0";

if (environment === "dev") {
    DASHBOARD_URL = "https://dev.app.genez.io";
    FRONTEND_DOMAIN = "dev.app.genez.io";
    BACKEND_ENDPOINT = "https://dev.api.genez.io";
    LOCAL_TEST_INTERFACE_URL = "https://dev.app.genez.io/test-interface/local";
    PORT_LOCAL_ENVIRONMENT = 8083;
    ENABLE_DEBUG_LOGS_BY_DEFAULT = true;
    DART_COMPILATION_ENDPOINT =
        "https://2uweph47zqvpgmiurihpnybdba0loxje.lambda-url.us-east-1.on.aws/";
    SENTRY_DSN =
        "https://949de0f5bbdf979b9b51d11d2291c1df@o4504060250488832.ingest.sentry.io/4506022210961408";
    ENVIRONMENT = "dev";
    GENEZIO_REGISTRY =
        "yptt62gzkhog5xuxtuwxvb6ohi0dtfhg.lambda-url.us-east-1.on.aws/RegistryHTTPHandler";
    REQUIRED_GENEZIO_TYPES_VERSION_RANGE = ">=1.0.0";
    RECOMMENTDED_GENEZIO_TYPES_VERSION_RANGE = "1.x";
} else {
    DASHBOARD_URL = "https://app.genez.io";
    FRONTEND_DOMAIN = "app.genez.io";
    BACKEND_ENDPOINT = "https://api.genez.io";
    LOCAL_TEST_INTERFACE_URL = "https://app.genez.io/test-interface/local";
    PORT_LOCAL_ENVIRONMENT = 8083;
    ENABLE_DEBUG_LOGS_BY_DEFAULT = false;
    DART_COMPILATION_ENDPOINT =
        "https://cniedue5ht4eylr4qtdp4w4qum0rgzgi.lambda-url.us-east-1.on.aws/";
    SENTRY_DSN =
        "https://4b80c74e91269ae9ae55cb43ad1de80a@o4504060250488832.ingest.sentry.io/4506022249627648";
    ENVIRONMENT = "prod";
    GENEZIO_REGISTRY =
        "rt3ersglfpyjlkzcjgql3s7xju0nuzym.lambda-url.us-east-1.on.aws/RegistryHTTPHandler";
    REQUIRED_GENEZIO_TYPES_VERSION_RANGE = ">=1.0.0";
    RECOMMENTDED_GENEZIO_TYPES_VERSION_RANGE = "1.x";
}

export {
    DASHBOARD_URL,
    FRONTEND_DOMAIN,
    BACKEND_ENDPOINT,
    PORT_LOCAL_ENVIRONMENT,
    ENABLE_DEBUG_LOGS_BY_DEFAULT,
    LOCAL_TEST_INTERFACE_URL,
    DART_COMPILATION_ENDPOINT,
    GENEZIO_TELEMETRY_ENDPOINT,
    ENVIRONMENT,
    SENTRY_DSN,
    GENEZIO_REGISTRY,
    REQUIRED_GENEZIO_TYPES_VERSION_RANGE,
    RECOMMENTDED_GENEZIO_TYPES_VERSION_RANGE,
    NODE_MINIMUM_VERSION,
};
