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
    GENEZIO_CLOUD = "genezio-cloud",
    GENEZIO_UNIKERNEL = "genezio-unikernel",
    GENEZIO_CLUSTER = "genezio-cluster",
    GENEZIO_AWS = "genezio-aws",

    GENEZIO_LEGACY = "genezio",
    CAPYBARA_LEGACY = "capybara",
    CAPYBARA_LINUX_LEGACY = "capybaraLinux",
    CLUSTER_LEGACY = "cluster",
}

export const CloudProviderMapping: Partial<
    Record<CloudProviderIdentifier, CloudProviderIdentifier>
> = {
    [CloudProviderIdentifier.CAPYBARA_LEGACY]: CloudProviderIdentifier.GENEZIO_UNIKERNEL,
    [CloudProviderIdentifier.CAPYBARA_LINUX_LEGACY]: CloudProviderIdentifier.GENEZIO_CLOUD,
    [CloudProviderIdentifier.GENEZIO_LEGACY]: CloudProviderIdentifier.GENEZIO_AWS,
    [CloudProviderIdentifier.CLUSTER_LEGACY]: CloudProviderIdentifier.GENEZIO_CLUSTER,
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
