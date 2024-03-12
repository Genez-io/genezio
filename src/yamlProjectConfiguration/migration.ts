import inquirer from "inquirer";
import { YamlProjectConfiguration as v1 } from "./v1.js";
import { YamlMethod, RawYamlProjectConfiguration as v2 } from "./v2.js";
import { Language } from "./models.js";
import path from "path";
import { scanClassesForDecorators } from "../utils/configuration.js";
import _ from "lodash";
import { CloudProviderIdentifier } from "../models/cloudProviderIdentifier.js";
import { UserError } from "../errors.js";

function compressArray<T>(array: T[] | undefined): T[] | T | undefined {
    if (!array) return undefined;

    if (array.length === 1) return array[0];

    return array;
}

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
            throw new UserError("genezio >= 1.0.0 needs a `genezio.yaml` file with version 2");
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
            });
            backendLanguage =
                scannedClasses.length > 0
                    ? path.parse(scannedClasses[0].path).ext.replace(".", "")
                    : undefined;
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
                      cloudProvider:
                          // AWS was deprecated in Genezio YAML v2
                          v1Config.cloudProvider === "aws"
                              ? CloudProviderIdentifier.GENEZIO
                              : (v1Config.cloudProvider as CloudProviderIdentifier),
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
                          language: (v1Config.sdk?.language || Language.ts) as Language,
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
