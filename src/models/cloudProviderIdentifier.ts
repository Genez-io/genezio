export enum CloudProviderIdentifier {
    // DEPRECATED - "aws" is deprecated, use "genezio" instead
    AWS = "aws",
    GENEZIO = "genezio",
    SELF_HOSTED_AWS = "selfHostedAws",
    CAPYBARA = "capybara",
}

export const cloudProviders = [
    // DEPRECATED - "aws" is deprecated, use "genezio" instead
    CloudProviderIdentifier.AWS,
    CloudProviderIdentifier.GENEZIO,
    CloudProviderIdentifier.SELF_HOSTED_AWS,
    CloudProviderIdentifier.CAPYBARA,
]
