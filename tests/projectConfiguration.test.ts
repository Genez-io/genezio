import { describe, expect, test } from "@jest/globals";
import { YamlProjectConfiguration, TriggerType } from "../src/models/yamlProjectConfiguration";
import { rectifyCronString } from "../src/utils/rectifyCronString";

describe("project configuration", () => {
    test("missing name should throw error", async () => {
        await expect(async () => {
            const yaml = {};
            await YamlProjectConfiguration.create(yaml);
        }).rejects.toThrowError("The name property is missing from the configuration file.");
    });

    test("invalid region should throw error", async () => {
        await expect(async () => {
            const yaml = {
                name: "test",
                region: "eu-central-first",
                sdk: {
                    path: "/",
                    language: "js",
                    options: {
                        runtime: "node",
                    },
                },
                classes: [
                    {
                        path: "test",
                    },
                ],
            };
            await YamlProjectConfiguration.create(yaml);
        }).rejects.toThrowError("The region is invalid. Please use a valid region.");
    });

    test("missing region should assign default to us-east-1", async () => {
        const yaml = {
            name: "test",
            region: "",
            sdk: {
                path: "/",
                language: "js",
                options: {
                    runtime: "node",
                },
            },
            classes: [
                {
                    path: "test",
                },
            ],
        };
        const configuration = await YamlProjectConfiguration.create(yaml);
        expect(configuration.region).toEqual("us-east-1");
    });

    test("missing cronString in cron method should throw error", async () => {
        await expect(async () => {
            const yaml = {
                name: "test",
                sdk: {
                    path: "/",
                    language: "js",
                    options: {
                        runtime: "node",
                    },
                },
                classes: [
                    {
                        name: "method1",
                        type: "cron",
                    },
                ],
            };
            await YamlProjectConfiguration.create(yaml);
        }).rejects.toThrowError();
    });

    test("cronString with 6 fields should throw error", async () => {
        await expect(async () => {
            const yaml = {
                name: "test",
                sdk: {
                    path: "/",
                    language: "js",
                },
                classes: [
                    {
                        name: "method1",
                        type: "cron",
                        cronString: "* * * * * *",
                    },
                ],
            };
            await YamlProjectConfiguration.create(yaml);
        }).rejects.toThrowError();
    });

    test("invalid cronString should throw error", async () => {
        await expect(async () => {
            const yaml = {
                name: "test",
                sdk: {
                    path: "/",
                    language: "js",
                },
                classes: [
                    {
                        name: "method1",
                        type: "cron",
                        cronString: "* * * * * *",
                    },
                ],
            };
            await YamlProjectConfiguration.create(yaml);
        }).rejects.toThrowError();
    });

    test("create configuration without methods defined no throw", async () => {
        await expect(async () => {
            const yaml = {
                name: "test",
                sdk: {
                    path: "/",
                    language: "js",
                    options: {
                        runtime: "node",
                    },
                },
                classes: [
                    {
                        path: "test",
                    },
                ],
            };
            await YamlProjectConfiguration.create(yaml);
            return {};
        }).not.toThrowError();
    });

    test("create a class with a cron method", async () => {
        const yaml = {
            name: "test",
            sdk: {
                path: "/",
                language: "js",
                options: {
                    runtime: "node",
                },
            },
            classes: [
                {
                    path: "test",
                    type: "http",
                    methods: [
                        {
                            name: "cronMethod",
                            type: "cron",
                            cronString: "5 8-17 * * *",
                        },
                    ],
                },
            ],
        };
        const configuration = await YamlProjectConfiguration.create(yaml);
        expect(configuration.classes[0].methods[0].name).toEqual("cronMethod");
        expect(configuration.classes[0].methods[0].type).toEqual(TriggerType.cron);
        expect(configuration.classes[0].methods[0].cronString).toEqual("5 8-17 * * *");
        return {};
    });

    test("create a class with type http and a cron method", async () => {
        const yaml = {
            name: "test",
            sdk: {
                path: "/",
                language: "js",
                options: {
                    runtime: "node",
                },
            },
            classes: [
                {
                    path: "test",
                    type: "http",
                    methods: [
                        {
                            name: "cronMethod",
                            type: "cron",
                            cronString: "* * * * *",
                        },
                    ],
                },
            ],
        };
        const configuration = await YamlProjectConfiguration.create(yaml);
        expect(configuration.classes[0].methods[0].name).toEqual("cronMethod");
        expect(configuration.classes[0].methods[0].type).toEqual(TriggerType.cron);
        expect(configuration.classes[0].methods[0].cronString).toEqual("* * * * *");
        return {};
    });

    test("create a class with type http and declare other methods", async () => {
        await expect(async () => {
            const yaml = {
                name: "test",
                sdk: {
                    path: "/",
                    language: "js",
                    options: {
                        runtime: "node",
                    },
                },
                classes: [
                    {
                        path: "test",
                        type: "http",
                        methods: [
                            {
                                name: "method1",
                            },
                            {
                                name: "method2",
                            },
                            {
                                name: "method3",
                                type: "cron",
                                cronString: "* * 2 * 2",
                            },
                        ],
                    },
                ],
            };
            await YamlProjectConfiguration.create(yaml);
        }).rejects.toThrowError();
    });

    test("create configuration without methods defined no throw", async () => {
        await expect(async () => {
            const yaml = {
                name: "test",
                sdk: {
                    path: "/",
                    language: "js",
                    options: {
                        runtime: "node",
                    },
                },
                classes: [
                    {
                        path: "test",
                    },
                ],
            };
            await YamlProjectConfiguration.create(yaml);
            return {};
        }).not.toThrowError();
    });

    test("create a class with type http", async () => {
        const yaml = {
            name: "test",
            sdk: {
                path: "/",
                language: "js",
                options: {
                    runtime: "node",
                },
            },
            classes: [
                {
                    path: "test",
                    type: "http",
                },
            ],
        };
        const configuration = await YamlProjectConfiguration.create(yaml);
        expect(configuration.classes[0].type).toEqual(TriggerType.http);
    });

    test("create a class with type http and declare other methods 2", async () => {
        const yaml = {
            name: "test",
            sdk: {
                path: "/",
                language: "js",
                options: {
                    runtime: "node",
                },
            },
            classes: [
                {
                    path: "test",
                    type: "http",
                    methods: [
                        {
                            name: "method1",
                        },
                        {
                            name: "method2",
                        },
                        {
                            name: "method3",
                            type: "cron",
                            cronString: "* * * * *",
                        },
                    ],
                },
            ],
        };
        const configuration = await YamlProjectConfiguration.create(yaml);
        expect(configuration.classes[0].methods[0].type).toEqual(TriggerType.http);
        expect(configuration.classes[0].methods[0].name).toEqual("method1");
        expect(configuration.classes[0].methods[1].type).toEqual(TriggerType.http);
        expect(configuration.classes[0].methods[1].name).toEqual("method2");
        expect(configuration.classes[0].methods[2].type).toEqual(TriggerType.cron);
        expect(configuration.classes[0].methods[2].name).toEqual("method3");
        return {};
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
