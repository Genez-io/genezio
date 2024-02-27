import { CloudProviderIdentifier } from "../models/cloudProviderIdentifier.js";
import getProjectInfoByName from "../requests/getProjectInfoByName.js";

// This function is used to check if the project is already deployed.
export async function isProjectDeployed(name: string, region: string): Promise<boolean> {
    try {
        const projectInfo = await getProjectInfoByName(name, region);
        if (projectInfo) {
            return true;
        }
    } catch (error) {
        return false;
    }
    return false;
}

// This function is used to randomly select a cloud provider for AB testing.
export function getRandomCloudProvider(): CloudProviderIdentifier {
    return Math.random() < 0.5
        ? CloudProviderIdentifier.GENEZIO
        : CloudProviderIdentifier.CAPYBARA_LINUX;
}
