import { beforeEach, describe, expect, test, vi } from "vitest";
import { performCloudProviderABTesting } from "../src/commands/deploy";
import { CloudProviderIdentifier, cloudProviders } from "../src/models/cloudProviderIdentifier";
import { vol } from "memfs";
import * as abTestingModule from "../src/utils/abTesting";

vi.mock("fs");

describe("test changing cloud providers for AB testing", () => {
    beforeEach(() => {
        vol.reset();
        vi.clearAllMocks();
    });

    test("project is deployed, should not change cloud provider from genezio", async () => {
        const isProjectDeployedSpy = vi.spyOn(abTestingModule, "isProjectDeployed");
        isProjectDeployedSpy.mockResolvedValue(true);

        const name = "test";
        const region = "us-east-1";
        const cloudProvider = CloudProviderIdentifier.GENEZIO;

        await expect(performCloudProviderABTesting(name, region, cloudProvider)).resolves.toEqual(
            CloudProviderIdentifier.GENEZIO,
        );
        expect(isProjectDeployedSpy).toHaveBeenCalledOnce();
    });

    test("project is deployed, should not change cloud provider from capybaraLinux", async () => {
        const isProjectDeployedSpy = vi.spyOn(abTestingModule, "isProjectDeployed");
        isProjectDeployedSpy.mockResolvedValue(true);

        const name = "test";
        const region = "us-east-1";
        const cloudProvider = CloudProviderIdentifier.CAPYBARA_LINUX;

        await expect(performCloudProviderABTesting(name, region, cloudProvider)).resolves.toEqual(
            CloudProviderIdentifier.CAPYBARA_LINUX,
        );
        expect(isProjectDeployedSpy).toHaveBeenCalledOnce();
    });

    test("project is not deployed, should change for capybaraLinux", async () => {
        const isProjectDeployedSpy = vi.spyOn(abTestingModule, "isProjectDeployed");
        isProjectDeployedSpy.mockResolvedValue(false);
        const getRandomCloudProviderSpy = vi.spyOn(abTestingModule, "getRandomCloudProvider");
        getRandomCloudProviderSpy.mockReturnValue(CloudProviderIdentifier.CAPYBARA_LINUX);

        const name = "test";
        const region = "us-east-1";
        const cloudProvider = CloudProviderIdentifier.GENEZIO;

        await expect(performCloudProviderABTesting(name, region, cloudProvider)).resolves.toEqual(
            CloudProviderIdentifier.CAPYBARA_LINUX,
        );
        expect(isProjectDeployedSpy).toHaveBeenCalledOnce();
        expect(getRandomCloudProviderSpy).toHaveBeenCalledOnce();
    });

    test("project is not deployed, cloud provider change to genezio", async () => {
        const isProjectDeployedSpy = vi.spyOn(abTestingModule, "isProjectDeployed");
        isProjectDeployedSpy.mockResolvedValue(false);
        const getRandomCloudProviderSpy = vi.spyOn(abTestingModule, "getRandomCloudProvider");
        getRandomCloudProviderSpy.mockReturnValue(CloudProviderIdentifier.GENEZIO);

        const name = "test";
        const region = "us-east-1";
        const cloudProvider = CloudProviderIdentifier.GENEZIO;

        await expect(performCloudProviderABTesting(name, region, cloudProvider)).resolves.toEqual(
            CloudProviderIdentifier.GENEZIO,
        );
        expect(isProjectDeployedSpy).toHaveBeenCalledOnce();
        expect(getRandomCloudProviderSpy).toHaveBeenCalledOnce();
    });

    test("cloud provider is not genezio initially, should not change", async () => {
        const isProjectDeployedSpy = vi.spyOn(abTestingModule, "isProjectDeployed");
        isProjectDeployedSpy.mockResolvedValue(false);
        const getRandomCloudProviderSpy = vi.spyOn(abTestingModule, "getRandomCloudProvider");
        getRandomCloudProviderSpy.mockReturnValue(CloudProviderIdentifier.CAPYBARA_LINUX);

        const name = "test";
        const region = "us-east-1";
        const cloudProvider = CloudProviderIdentifier.SELF_HOSTED_AWS;

        await expect(performCloudProviderABTesting(name, region, cloudProvider)).resolves.toEqual(
            CloudProviderIdentifier.SELF_HOSTED_AWS,
        );
        expect(isProjectDeployedSpy).toHaveBeenCalledOnce();
    });
});
