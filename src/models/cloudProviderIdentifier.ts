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
    CAPYBARA_LINUX = "genezio-cloud",
    CAPYBARA = "genezio-unikernel",
    CLUSTER = "genezio-cluster",
    GENEZIO = "genezio-aws",

    SELF_HOSTED_AWS = "selfHostedAws",

    GENEZIO_LEGACY = "genezio",
    CAPYBARA_LEGACY = "capybara",
    CAPYBARA_LINUX_LEGACY = "capybaraLinux",
    CLUSTER_LEGACY = "cluster",
}

export const CloudProviderMapping: Partial<Record<CloudProviderIdentifier, CloudProviderIdentifier>> = {
    [CloudProviderIdentifier.CAPYBARA_LEGACY]: CloudProviderIdentifier.CAPYBARA,
    [CloudProviderIdentifier.CAPYBARA_LINUX_LEGACY]: CloudProviderIdentifier.CAPYBARA_LINUX,
    [CloudProviderIdentifier.GENEZIO_LEGACY]: CloudProviderIdentifier.GENEZIO,
    [CloudProviderIdentifier.CLUSTER_LEGACY]: CloudProviderIdentifier.CLUSTER,
};

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
