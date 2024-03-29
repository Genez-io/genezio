import { Request } from "express";
import { OutgoingHttpHeaders } from "http2";

/*
 * Use cloud adapter to alternate between the supported cloud infrastructures.
 * This information is not meant to be user-facing.
 * It's meant to organize resources on genezio infrastructure.
 */
export enum CloudAdapterIdentifier {
    AWS = "aws",
    RUNTIME = "runtime",
    CLUSTER = "cluster",
}

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
