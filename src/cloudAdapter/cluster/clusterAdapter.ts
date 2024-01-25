import log from "loglevel";
import { ProjectConfiguration } from "../../models/projectConfiguration.js";
import { YamlFrontend } from "../../models/yamlProjectConfiguration.js";
import {
    CloudAdapter,
    CloudAdapterOptions,
    GenezioCloudInput,
    GenezioCloudOutput,
} from "../cloudAdapter.js";
import { debugLogger } from "../../utils/logging.js";
import { getContainerRegistryCreds } from "../../requests/getContainerRegistryCreds.js";
import { SpawnSyncReturns, spawnSync } from "child_process";
import { deployRequest } from "../../requests/deployCode.js";
import { getAuthToken } from "../../utils/accounts.js";

export class ClusterCloudAdapter implements CloudAdapter {
    async deploy(
        input: GenezioCloudInput[],
        projectConfiguration: ProjectConfiguration,
        cloudAdapterOptions: CloudAdapterOptions,
    ): Promise<GenezioCloudOutput> {
        const stage: string = cloudAdapterOptions.stage || "";

        log.info("Deploying your backend project to genezio infrastructure...");

        // Login to container repository
        let dockerlogin: SpawnSyncReturns<Buffer> | null = null;

        const dockerPasswd = `HRBR${((await getAuthToken()) || "").substring(0, 64)}`;
        const promisesDeploy = input.map(async (element) => {
            debugLogger.debug(`Get the registry push data for class name ${element.name}.`);
            const registryCreds = await getContainerRegistryCreds(
                projectConfiguration.name,
                element.name,
            );

            if (dockerlogin === null) {
                spawnSync("docker", ["logout", registryCreds.repository], {
                    stdio: "inherit",
                });

                dockerlogin = spawnSync(
                    "docker",
                    [
                        "login",
                        "-u",
                        registryCreds.username,
                        "-p",
                        dockerPasswd,
                        registryCreds.repository,
                    ],
                    { stdio: "inherit" },
                );

                if (dockerlogin.status !== 0) {
                    throw new Error(`Error during docker login. Exit code: ${dockerlogin.status}`);
                }
            }

            debugLogger.debug(`Upload the content to Harbor registry for class ${element.name}.`);

            // tag image
            // TODO: discuss with team about timestamp based tagging/versioning of images
            const timestamp = Date.now().toString();
            const tag =
                `${registryCreds.repository}/${registryCreds.username}/${element.name}:${timestamp}`.toLowerCase();

            projectConfiguration.classes.find((c) => c.name === element.name)!.options = {
                ...projectConfiguration.classes.find((c) => c.name === element.name)!.options,
                timestamp,
            };

            const dockerTag = spawnSync(
                "docker",
                ["tag", `${projectConfiguration.name}-${element.name}`.toLowerCase(), tag],

                { stdio: "inherit" },
            );
            if (dockerTag.status !== 0) {
                throw new Error(`Error during docker tag. Exit code: ${dockerTag.status}`);
            }

            // push image
            const dockerPush = spawnSync("docker", ["push", tag], { stdio: "inherit" });
            if (dockerPush.status !== 0) {
                throw new Error(`Error during docker push. Exit code: ${dockerPush.status}`);
            }
            debugLogger.debug(`Done uploading the container image for ${element.name}.`);
        });

        await Promise.all(promisesDeploy);

        const response = await deployRequest(projectConfiguration, stage);
        const classesInfo = response.classes.map((c) => ({
            className: c.name,
            methods: c.methods.map((m) => ({
                name: m.name,
                type: m.type,
                cronString: m.cronString,
                functionUrl: getFunctionUrl(c.cloudUrl, m.type, c.name, m.name),
            })),
            functionUrl: c.cloudUrl,
            projectId: response.projectId,
        }));

        return {
            projectEnvId: "",
            classes: classesInfo,
        };
    }

    deployFrontend(
        projectName: string,
        projectRegion: string,
        frontend: YamlFrontend,
        stage: string,
    ): Promise<string> {
        throw new Error("Method not implemented." + projectName + projectRegion + frontend + stage);
    }
}

function getFunctionUrl(
    baseUrl: string,
    methodType: string,
    className: string,
    methodName: string,
): string {
    if (methodType === "http") {
        // trim the last slash of baseUrl if it exists
        if (baseUrl.endsWith("/")) {
            baseUrl = baseUrl.slice(0, -1);
        }
        return `${baseUrl}/${className}/${methodName}`;
    } else {
        return `${baseUrl}/${className}`;
    }
}
