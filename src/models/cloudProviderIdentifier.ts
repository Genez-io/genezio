import { Request } from "express";
import { OutgoingHttpHeaders } from "http2";

export enum CloudProviderIdentifier {
    GENEZIO = "genezio",
    SELF_HOSTED_AWS = "selfHostedAws",
    CAPYBARA = "capybara",
    CAPYBARA_LINUX = "capybaraLinux",
    CLUSTER = "cluster",
}

export interface LambdaResponse {
    statusDescription: string;
    statusCode: string;
    isBase64Encoded: boolean;
    body: string;
    headers: OutgoingHttpHeaders;
}

export interface AwsApiGatewayRequest extends Request {
    isBase64Encoded?: boolean;
}
