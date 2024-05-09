import { CloudProviderIdentifier } from "../../models/cloudProviderIdentifier.js";
import { GenezioRuntimeGoBundler } from "./genezioRuntimeGoBundler.js";
import { LambdaGoBundler } from "./lambdaGoBundler.js";
import { ProjectConfiguration } from "../../models/projectConfiguration.js";
import { BundlerInterface } from "../bundler.interface.js";

export function NewGoBundler(projectConfiguration: ProjectConfiguration): BundlerInterface {
    if (
        projectConfiguration.cloudProvider == CloudProviderIdentifier.GENEZIO_UNIKERNEL ||
        projectConfiguration.cloudProvider == CloudProviderIdentifier.GENEZIO_CLOUD
    ) {
        return new GenezioRuntimeGoBundler();
    }

    return new LambdaGoBundler();
}
