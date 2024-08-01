import { describe, test, expect, vi, beforeEach } from "vitest";
import { fs, fs as memfsFs, vol } from "memfs";
import { YamlConfigurationIOController } from "../src/projectConfiguration/yaml/v2";
import yaml from "yaml";
import { rectifyCronString } from "../src/utils/rectifyCronString";

vi.mock("fs", () => {
    return { default: memfsFs };
});
vi.mock("fs/promises", () => {
    return { default: memfsFs.promises };
});

describe("yaml project configuration", () => {
    beforeEach(() => {
        // Clean up the mocked file system before each test
        vol.reset();
        vol.mkdirSync(process.cwd(), { recursive: true });
    });

    test("missing name should throw error", async () => {
        const yamlConfig = {};
        fs.writeFileSync("genezio.yaml", yaml.stringify(yamlConfig));

        await expect(async () => {
            await new YamlConfigurationIOController().read();
        }).rejects.toThrowError("Field `name`:\n\t- Required");
    });

    test("invalid region should throw error", async () => {
        const yamlConfig = {
            name: "test",
            region: "eu-central-first",
            yamlVersion: 2,
        };
        fs.writeFileSync("genezio.yaml", yaml.stringify(yamlConfig));

        await expect(async () => {
            await new YamlConfigurationIOController().read();
        }).rejects.toThrowError("Field `region`:\n\t- Invalid enum value.");
    });

    test("missing region should assign default to us-east-1", async () => {
        const yamlConfig = {
            name: "test",
            yamlVersion: 2,
        };
        fs.writeFileSync("genezio.yaml", yaml.stringify(yamlConfig));

        const configuration = await new YamlConfigurationIOController().read();
        expect(configuration.region).toEqual("us-east-1");
    });

    test("missing cronString in cron method should throw error", async () => {
        const yamlConfig = {
            name: "test",
            region: "us-east-1",
            yamlVersion: 2,
            backend: {
                path: ".",
                language: {
                    name: "ts",
                },
                classes: [
                    {
                        name: "Service",
                        path: "service",
                        methods: [
                            {
                                name: "method",
                                type: "cron",
                            },
                        ],
                    },
                ],
            },
        };
        fs.writeFileSync("genezio.yaml", yaml.stringify(yamlConfig));

        await expect(async () => {
            await new YamlConfigurationIOController().read();
        }).rejects.toThrowError("Field `backend.classes.0.methods.0.cronString`:\n\t- Required");
    });

    test("invalid cronString should throw error", async () => {
        const yamlConfig = {
            name: "test",
            yamlVersion: 2,
            backend: {
                path: ".",
                language: {
                    name: "ts",
                },
                classes: [
                    {
                        name: "Service",
                        path: "service",
                        methods: [
                            {
                                name: "method",
                                type: "cron",
                                cronString: "* * * * * *",
                            },
                        ],
                    },
                ],
            },
        };
        fs.writeFileSync("genezio.yaml", yaml.stringify(yamlConfig));

        await expect(async () => {
            await new YamlConfigurationIOController().read();
        }).rejects.toThrowError(
            "Field `backend.classes.0.methods.0`:\n\t- The cronString is not valid.",
        );
    });

    test("create configuration without methods defined no throw", async () => {
        const yamlConfig = {
            name: "test",
            yamlVersion: 2,
            backend: {
                path: ".",
                language: {
                    name: "ts",
                },
                classes: [
                    {
                        name: "Service",
                        path: "service",
                    },
                ],
            },
        };
        fs.writeFileSync("genezio.yaml", yaml.stringify(yamlConfig));

        await new YamlConfigurationIOController().read();
    });

    test("convert nonstandard cron strings", async () => {
        expect(rectifyCronString("* * * * *")).toEqual("* * * * *");
        expect(rectifyCronString("2/1 * * * *")).toEqual("2-59/1 * * * *");
        expect(rectifyCronString("1 * * * *")).toEqual("1 * * * *");
        expect(rectifyCronString("2-59/5 * * * *")).toEqual("2-59/5 * * * *");
        expect(rectifyCronString("2/1 2/1 2/1 2/1 2/1")).toEqual(
            "2-59/1 2-23/1 2-31/1 2-12/1 2,3,4,5,6,0/1",
        );
    });
});
