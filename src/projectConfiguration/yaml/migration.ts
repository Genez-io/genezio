import inquirer from "inquirer";
import { YamlProjectConfiguration as v1 } from "./v1.js";
import { YamlMethod, RawYamlProjectConfiguration as v2 } from "./v2.js";
import { Language } from "./models.js";
import path from "path";
import { scanClassesForDecorators } from "../../utils/configuration.js";
import _ from "lodash";
import { CloudProviderIdentifier } from "../../models/cloudProviderIdentifier.js";
import { UserError } from "../../errors.js";
import { isCI } from "../../utils/process.js";

function compressArray<T>(array: T[] | undefined): T[] | T | undefined {
    if (!array) return undefined;

    if (array.length === 1) return array[0];

    return array;
}

export async function tryV2Migration(config: unknown): Promise<v2 | undefined> {
    if (isCI())
        throw new UserError(
            `You are using an old version of the YAML configuration file. Please update it to the latest version. For more information, check the migration guide at https://genezio.com/docs/learn-more/upgrading-to-v1`,
        );

    try {
        const v1Config = await v1.create(config);
        const { migrate }: { migrate: boolean } = await inquirer.prompt({
            name: "migrate",
            type: "confirm",
            message:
                "Your project configuration is using an old version of the YAML configuration file. Would you like to migrate it to the latest version?",
        });
        if (!migrate) {
            throw new UserError(
                "genezio >= 1.0.0 needs a `genezio.yaml` file with version 2. For more information, check the migration guide at https://genezio.com/docs/learn-more/upgrading-to-v1",
            );
        }

        let frontendPath = undefined,
            frontendPublish = undefined;
        if (v1Config.workspace?.frontend) {
            frontendPath = v1Config.workspace.frontend;
            frontendPublish = path.relative(frontendPath, v1Config.frontend?.path || frontendPath);
        } else if (v1Config.frontend) {
            frontendPublish = v1Config.frontend.path;
            if (/(build|dist)[/\\]?$/.test(frontendPublish)) {
                frontendPath = path.dirname(frontendPublish);
            } else {
                frontendPath = frontendPublish;
            }
        }

        let backendLanguage;
        if (v1Config.classes && v1Config.classes.length > 0) {
            backendLanguage = v1Config.classes[0].language.replace(".", "");
        } else {
            const scannedClasses = await scanClassesForDecorators({
                path: v1Config.workspace?.backend || ".",
                language: {
                    name: Language.ts,
                },
            });
            backendLanguage =
                scannedClasses.length > 0
                    ? path.parse(scannedClasses[0].path).ext.replace(".", "")
                    : undefined;
        }

        if (
            (v1Config.cloudProvider as unknown as CloudProviderIdentifier) ===
            CloudProviderIdentifier.GENEZIO_CLUSTER
        ) {
            throw new UserError(
                "genezio >= 1.0.0 is required for the migration of the cloud provider to cluster",
            );
        }

        const v2Config: v2 = {
            name: v1Config.name,
            region: v1Config.region,
            yamlVersion: 2,
            backend: backendLanguage
                ? {
                      path: v1Config.workspace?.backend ?? ".",
                      language: {
                          name: backendLanguage as Language,
                          runtime: v1Config.options?.nodeRuntime,
                          packageManager: v1Config.packageManager,
                      },
                      classes: v1Config.classes.map((c) => ({
                          name: c.name,
                          path: path.relative(v1Config.workspace?.backend ?? ".", c.path),
                          type: c.type,
                          methods: c.methods.map((m) => ({
                              name: m.name,
                              type: m.type,
                              cronString: m.cronString,
                          })) as YamlMethod[],
                      })),
                      scripts: {
                          deploy: compressArray(
                              v1Config.scripts?.preBackendDeploy?.split("&&").map((s) => s.trim()),
                          ),
                          local: compressArray(
                              v1Config.scripts?.preStartLocal?.split("&&").map((s) => s.trim()),
                          ),
                      },
                  }
                : undefined,
            frontend:
                frontendPath && v1Config.frontend
                    ? {
                          path: frontendPath,
                          sdk: v1Config.sdk
                              ? {
                                    language: v1Config.sdk.language as Language,
                                    path: path.relative(frontendPath, v1Config.sdk.path),
                                }
                              : undefined,
                          subdomain: v1Config.frontend.subdomain,
                          publish: frontendPublish,
                          scripts: {
                              deploy: compressArray(
                                  v1Config.scripts?.preFrontendDeploy
                                      ?.split("&&")
                                      .map((s) => s.trim()),
                              ),
                          },
                      }
                    : undefined,
        };

        // Delete empty scripts from backend
        if (v2Config.backend && _.isEmpty(v2Config.backend.scripts)) {
            delete v2Config.backend.scripts;
        }

        // Delete empty scripts from frontend
        if (_.isArray(v2Config.frontend)) {
            for (const frontend of v2Config.frontend) {
                if (_.isEmpty(frontend.scripts)) {
                    delete frontend.scripts;
                }
            }
        } else {
            if (v2Config.frontend && _.isEmpty(v2Config.frontend.scripts)) {
                delete v2Config.frontend.scripts;
            }
        }

        // Delete empty classes array from backend
        if (v2Config.backend && _.isEmpty(v2Config.backend?.classes)) {
            delete v2Config.backend.classes;
        }

        // Delete empty methods array from classes
        if (v2Config.backend?.classes) {
            for (const c of v2Config.backend.classes) {
                if (_.isEmpty(c.methods)) {
                    delete c.methods;
                }
            }
        }

        return v2Config;
    } catch {
        return undefined;
    }
}
