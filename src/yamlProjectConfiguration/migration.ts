import inquirer from "inquirer";
import { YamlProjectConfiguration as v1 } from "./v1.js";
import { YamlMethod, YamlProjectConfiguration as v2 } from "./v2.js";
import { exit } from "process";
import log from "loglevel";
import { PackageManagerType } from "../packageManagers/packageManager.js";
import { CloudProviderIdentifier } from "../models/cloudProviderIdentifier.js";
import { Language, SdkType } from "./models.js";
import path from "path";

export async function tryV2Migration(config: unknown): Promise<v2 | undefined> {
    if (process.env["CI"]) return undefined;

    try {
        const v1Config = await v1.create(config);
        const { migrate }: { migrate: boolean } = await inquirer.prompt({
            name: "migrate",
            type: "confirm",
            message:
                "Your project configuration is using an old version of the YAML configuration file. Would you like to migrate it to the latest version?",
        });
        if (!migrate) {
            // TODO: Add migration article link
            log.error("genezio >= 1.0.0 needs a `genezio.yaml` file with version 2");
            exit(0);
        }

        const frontendPath = v1Config.workspace?.frontend || ".";
        const frontendPublish = path.relative(
            frontendPath,
            v1Config.frontend?.path || frontendPath,
        );
        const v2Config: v2 = {
            name: v1Config.name,
            region: v1Config.region,
            yamlVersion: 2,
            backend: {
                path: v1Config.workspace?.backend ?? ".",
                language: {
                    name: v1Config.language,
                    runtime: v1Config.options?.nodeRuntime ?? "nodejs18.x",
                    packageManager: v1Config.packageManager ?? PackageManagerType.npm,
                },
                cloudProvider: v1Config.cloudProvider ?? CloudProviderIdentifier.GENEZIO,
                classes: v1Config.classes.map((c) => ({
                    name: c.name ?? "TODO",
                    path: path.relative(v1Config.workspace?.backend ?? ".", c.path),
                    cloudProvider: v1Config.cloudProvider as CloudProviderIdentifier,
                    type: c.type,
                    methods: c.methods.map((m) => ({
                        name: m.name,
                        type: m.type,
                        cronString: m.cronString,
                    })) as YamlMethod[],
                })),
                scripts: {
                    deploy: v1Config.scripts?.preBackendDeploy?.split("&&").map((s) => s.trim()),
                    local: v1Config.scripts?.preStartLocal?.split("&&").map((s) => s.trim()),
                },
                sdk: v1Config.sdk
                    ? {
                          type: SdkType.folder,
                          path: v1Config.sdk.path,
                          language: v1Config.sdk.language as Language,
                      }
                    : undefined,
            },
            frontend: v1Config.frontend
                ? {
                      path: frontendPath,
                      language: v1Config.language,
                      subdomain: v1Config.frontend.subdomain,
                      publish: frontendPublish,
                      scripts: {
                          deploy: v1Config.scripts?.preFrontendDeploy
                              ?.split("&&")
                              .map((s) => s.trim()),
                      },
                  }
                : undefined,
        };

        if (v2Config.backend?.classes?.length === 0) {
            delete v2Config.backend.classes;
        }

        return v2Config;
    } catch {
        return undefined;
    }
}
