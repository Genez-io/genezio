// eslint-disable-next-line @typescript-eslint/no-var-requires
import MIMETypeParser from "whatwg-mimetype";
import type { RequestHandler } from "express";
import { AwsApiGatewayRequest } from "../models/cloudProviderIdentifier.js";

/**
 * Check if the body is of type binary.
 * @param contentType The content type of the request
 * @returns True if the body is binary, false otherwise.
 */
function bodyIsBinary(rawContentType: string) {
    if (!rawContentType) {
        return true;
    }
    const contentType = new MIMETypeParser(rawContentType);

    if (contentType.type === "text") {
        return false;
    } else if (contentType.type !== "application") {
        return true;
    } else
        return !["json", "ld+json", "x-httpd-php", "x-sh", "x-csh", "xhtml+xml", "xml"].includes(
            contentType.subtype,
        );
}

/**
 * Express JS middleware that parses the request similar to how AWS API Gateway does it.
 */
export const genezioRequestParser: RequestHandler = (
    request: AwsApiGatewayRequest,
    response,
    next,
) => {
    const headers = request.headers;
    const contentType = headers["content-type"];

    if (request.body && request.body.length > 0) {
        if (contentType && bodyIsBinary(contentType)) {
            request.body = request.body.toString("base64");
            request.isBase64Encoded = true;
        } else {
            request.body = request.body.toString();
            request.isBase64Encoded = false;
        }
    } else {
        request.body = undefined;
    }

    next();
};
