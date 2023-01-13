import { describe, expect, test } from "@jest/globals";
import {
  Language,
  ProjectConfiguration,
  TriggerType
} from "../src/models/projectConfiguration";
import log from "loglevel";

describe("project configuration", () => {
  test("missing name should throw error", async () => {
    await expect(async () => {
      const yaml = {};
      await ProjectConfiguration.create(yaml);
    }).rejects.toThrowError();
  });

  test("missing sdk should throw error", async () => {
    await expect(async () => {
      const yaml = {
        name: "test"
      };
      await ProjectConfiguration.create(yaml);
    }).rejects.toThrowError();
  });

  test("missing sdk.sdkLanguage should throw error", async () => {
    await expect(async () => {
      const yaml = {
        name: "test",
        sdk: {
          path: "/"
        }
      };
      await ProjectConfiguration.create(yaml);
    }).rejects.toThrowError();
  });

    test('invalid region should throw error', async () => {
        await expect(async () => {
            const yaml = {
                name: "test",
                region: "eu-central-first",
                sdk: {
                    path: "/",
                    language: "js",
                    runtime: "node"
                },
                classes: [
                    {
                        path: "test"
                    }
                ]
            }
            await ProjectConfiguration.create(yaml)
        }).rejects.toThrowError()
    });

    test('missing region should assign default to us-east-1', async () => {
        const yaml = {
            name: "test",
            region: "",
            sdk: {
                path: "/",
                language: "js",
                runtime: "node"
            },
            classes: [
                {
                    path: "test"
                }
            ]
        }
        const configuration = await ProjectConfiguration.create(yaml)
        expect(configuration.region).toEqual("us-east-1")
    });

    test('missing sdk.language should throw error', async () => {
        await expect(async () => {
            const yaml = {
                name: "test",
                sdk: {
                    path: "/"
                }
            }
            await ProjectConfiguration.create(yaml)
        }).rejects.toThrowError()
    });

    test('wrong sdk.language should throw error', async () => {
        await expect(async () => {
            const yaml = {
                name: "test",
                sdk: {
                    path: "/",
                    language: "nothing"
                }
            }
            await ProjectConfiguration.create(yaml)
        }).rejects.toThrowError()
    });

    test('missing class should throw error', async () => {
        await expect(async () => {
            const yaml = {
                name: "test",
                sdk: {
                    path: "/",
                    language: "js",
                    runtime: "node"
                }
            }
            await ProjectConfiguration.create(yaml)
        }).rejects.toThrowError()
    });

    test('missing cronString in cron method should throw error', async () => {
        await expect(async () => {
            const yaml = {
                name: "test",
                sdk: {
                    path: "/",
                    language: "js",
                    runtime: "node"
                },
                classes: [
                    {
                        name: "method1",
                        type: "cron"
                    }
                ]
            }
            await ProjectConfiguration.create(yaml)
        }).rejects.toThrowError()
    });

    test('cronString with 5 fields should throw error', async () => {
        await expect(async () => {
            const yaml = {
                name: "test",
                sdk: {
                    path: "/",
                    language: "js",
                    options: {
                      runtime: "node"
                    }
                },
                classes: [
                    {
                        name: "method1",
                        type: "cron",
                        cronString: "* * * * *"
                    }
                ]
            }
            await ProjectConfiguration.create(yaml)
        }).rejects.toThrowError()
    });

    test('invalid cronString should throw error', async () => {
        await expect(async () => {
            const yaml = {
                name: "test",
                sdk: {
                    path: "/",
                    language: "js",
                    runtime: "node"
                },
                classes: [
                    {
                        name: "method1",
                        type: "cron",
                        cronString: "* * * * * *"
                    }
                ]
            }
            await ProjectConfiguration.create(yaml)
        }).rejects.toThrowError()
    });

    test('create configuration without methods defined no throw', async () => {
        await expect(async () => {
            const yaml = {
                name: "test",
                sdk: {
                    path: "/",
                    language: "js",
                    runtime: "node"
                },
                classes: [
                    {
                        path: "test"
                    }
                ]
            }
            await ProjectConfiguration.create(yaml)
            return {}
        }).not.toThrowError()
    });

  test("wrong sdk.language should throw error", async () => {
    await expect(async () => {
      const yaml = {
        name: "test",
        sdk: {
          path: "/",
          language: "nothing"
        }
      };
      await ProjectConfiguration.create(yaml);
    }).rejects.toThrowError();
  });

  test("missing class should throw error", async () => {
    await expect(async () => {
      const yaml = {
        name: "test",
        sdk: {
          path: "/",
          language: "js",
          options: {
            runtime: "node"
          }
        }
      };
      await ProjectConfiguration.create(yaml);
    }).rejects.toThrowError();
  });
    test('create a class with a cron method', async () => {
        const yaml = {
            name: "test",
            sdk: {
                path: "/",
                language: "js",
                options: {
                  runtime: "node"
                }
            },
            classes: [
                {
                    path: "test",
                    type: "http",
                    methods: [
                        {
                            name: "cronMethod",
                            type: "cron",
                            cronString: "0/5 8-17 ? * MON-FRI *"
                        }
                    ]
                }
            ]
        }
        const configuration = await ProjectConfiguration.create(yaml)
        expect(configuration.classes[0].methods[0].name).toEqual("cronMethod")
        expect(configuration.classes[0].methods[0].type).toEqual(TriggerType.cron)
        expect(configuration.classes[0].methods[0].cronString).toEqual("0/5 8-17 ? * MON-FRI *")
        return {}
    });


    test('create a class with type http and a cron method', async () => {
        const yaml = {
            name: "test",
            sdk: {
                path: "/",
                language: "js",
                options: {
                  runtime: "node"
                }
            },
            classes: [
                {
                    path: "test",
                    type: "http",
                    methods: [
                        {
                            name: "cronMethod",
                            type: "cron",
                            cronString: "* * * * ? *"
                        }
                    ]
                }
            ]
        }
        const configuration = await ProjectConfiguration.create(yaml)
        expect(configuration.classes[0].methods[0].name).toEqual("cronMethod")
        expect(configuration.classes[0].methods[0].type).toEqual(TriggerType.cron)
        expect(configuration.classes[0].methods[0].cronString).toEqual("* * * * ? *")
        return {}
    });

    test('create a class with type http and declare other methods', async () => {
      await expect(async () => {
        const yaml = {
            name: "test",
            sdk: {
                path: "/",
                language: "js",
                options: {
                  runtime: "node"
                }
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
                            cronString: "* * * * * *"
                        }
                    ]
                }
            ]
        }
        await ProjectConfiguration.create(yaml);
    }).rejects.toThrowError();
  });

  test("missing cronString in cron method should throw error", async () => {
    await expect(async () => {
      const yaml = {
        name: "test",
        sdk: {
          path: "/",
          language: "js",
          options: {
            runtime: "node"
          }
        },
        classes: [
          {
            name: "method1",
            type: "cron"
          }
        ]
      };
      await ProjectConfiguration.create(yaml);
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
            runtime: "node"
          }
        },
        classes: [
          {
            path: "test"
          }
        ]
      };
      await ProjectConfiguration.create(yaml);
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
          runtime: "node"
        }
      },
      classes: [
        {
          path: "test",
          type: "http"
        }
      ]
    };
    const configuration = await ProjectConfiguration.create(yaml);
    expect(configuration.classes[0].type).toEqual(TriggerType.http);
  });

  test("create a class with type http and declare other methods 2", async () => {
    const yaml = {
      name: "test",
      sdk: {
        path: "/",
        language: "js",
        options: {
          runtime: "node"
        }
      },
      classes: [
        {
          path: "test",
          type: "http",
          methods: [
            {
              name: "method1"
            },
            {
              name: "method2"
            },
            {
              name: "method3",
              type: "cron",
              cronString: "* * * * ? *"
            }
          ]
        }
      ]
    };
    const configuration = await ProjectConfiguration.create(yaml);
    expect(configuration.classes[0].methods[0].type).toEqual(TriggerType.http);
    expect(configuration.classes[0].methods[0].name).toEqual("method1");
    expect(configuration.classes[0].methods[1].type).toEqual(TriggerType.http);
    expect(configuration.classes[0].methods[1].name).toEqual("method2");
    expect(configuration.classes[0].methods[2].type).toEqual(TriggerType.cron);
    expect(configuration.classes[0].methods[2].name).toEqual("method3");
    return {};
  });
});
