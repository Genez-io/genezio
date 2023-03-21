import { describe, expect, test } from "@jest/globals";
import {
  YamlProjectConfiguration,
  TriggerType
} from "../src/models/yamlProjectConfiguration";


describe("project configuration", () => {
  test("missing name should throw error", async () => {
    await expect(async () => {
      const yaml = {};
      await YamlProjectConfiguration.create(yaml);
    }).rejects.toThrowError("The name property is missing from the configuration file.");
  });

  test("missing sdk should throw error", async () => {
    await expect(async () => {
      const yaml = {
        name: "test"
      };
      await YamlProjectConfiguration.create(yaml);
    }).rejects.toThrowError("The sdk property is missing from the configuration file.");
  });

  test("missing sdk.language should throw error", async () => {
    await expect(async () => {
      const yaml = {
        name: "test",
        sdk: {
          path: "/"
        }
      };
      await YamlProjectConfiguration.create(yaml);
    }).rejects.toThrowError("The sdk.language property is missing.");
  }); 

  test("missing sdk.path should throw error", async () => {
    await expect(async () => {
      const yaml = {
        name: "test",
        sdk: {
          language: "js"
        }
      };
      await YamlProjectConfiguration.create(yaml);
    }).rejects.toThrowError("The sdk.path property is missing from the configuration file.");
  });

  test("missing sdk.options should throw error", async () => {
    await expect(async () => {
      const yaml = {
        name: "test",
        sdk: {
          path: "/",
          language: "js"
        }
      };
      await YamlProjectConfiguration.create(yaml);
    }).rejects.toThrowError("The sdk.options property is missing from the configuration file.");
  });

  test("missing sdk.runtime should throw error", async () => {
    await expect(async () => {
      const yaml = {
        name: "test",
        sdk: {
          path: "/",
          language: "js",
          options: {
            runtime: "",
          },
        }
      };
      await YamlProjectConfiguration.create(yaml);
    }).rejects.toThrowError("The sdk.options.runtime property is missing from the configuration file.");
  });

  test("wrong sdk.runtime should throw error", async () => {
    await expect(async () => {
      const yaml = {
        name: "test",
        sdk: {
          path: "/",
          language: "js",
          options: {
            runtime: "wrong",
          },
        }
      };
      await YamlProjectConfiguration.create(yaml);
    }).rejects.toThrowError("The sdk.options.runtime property is invalid.");
  });

  test('invalid region should throw error', async () => {
      await expect(async () => {
          const yaml = {
              name: "test",
              region: "eu-central-first",
              sdk: {
                  path: "/",
                  language: "js",
                  options:{
                    runtime: "node",
                  },
              },
              classes: [
                  {
                      path: "test"
                  }
              ]
          }
          await YamlProjectConfiguration.create(yaml)
      }).rejects.toThrowError("The region is invalid. Please use a valid region.")
  });

  test('missing region should assign default to us-east-1', async () => {
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
                  path: "test"
              }
          ]
      }
      const configuration = await YamlProjectConfiguration.create(yaml)
      expect(configuration.region).toEqual("us-east-1")
  });

    test('missing class should throw error', async () => {
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
            }
            await YamlProjectConfiguration.create(yaml)
        }).rejects.toThrowError()
    });

    test('missing cronString in cron method should throw error', async () => {
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
                        type: "cron"
                    }
                ]
            }
            await YamlProjectConfiguration.create(yaml)
        }).rejects.toThrowError()
    });

    test('cronString with 6 fields should throw error', async () => {
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
                        cronString: "* * * * * *"
                    }
                ]
            }
            await YamlProjectConfiguration.create(yaml)
        }).rejects.toThrowError()
    });

    test('invalid cronString should throw error', async () => {
        await expect(async () => {
            const yaml = {
                name: "test",
                sdk: {
                    path: "/",
                    language: "js",
                    runtime: "node",
                  },
                classes: [
                    {
                        path: "/",
                        name: "method1",
                        type: "cron",
                        cronString: "* * * * * *"
                    }
                ]
            }
            await YamlProjectConfiguration.create(yaml)
        }).rejects.toThrowError()
    });

    test('create configuration without methods defined no throw', async () => {
        await expect(async () => {
            const yaml = {
                name: "test",
                sdk: {
                    path: "/",
                    language: "js",
                    options: {
                      runtime: "node"
                    },
                },
                classes: [
                    {
                        path: "test"
                    }
                ]
            }
            await YamlProjectConfiguration.create(yaml)
            return {}
        }).not.toThrowError()
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
                            cronString: "5 8-17 * * *"
                        }
                    ]
                }
            ]
        }
        const configuration = await YamlProjectConfiguration.create(yaml)
        expect(configuration.classes[0].methods[0].name).toEqual("cronMethod")
        expect(configuration.classes[0].methods[0].type).toEqual(TriggerType.cron)
        expect(configuration.classes[0].methods[0].cronString).toEqual("5 8-17 * * *")
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
                            cronString: "* * * * *"
                        }
                    ]
                }
            ]
        }
        const configuration = await YamlProjectConfiguration.create(yaml)
        expect(configuration.classes[0].methods[0].name).toEqual("cronMethod")
        expect(configuration.classes[0].methods[0].type).toEqual(TriggerType.cron)
        expect(configuration.classes[0].methods[0].cronString).toEqual("* * * * *")
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
                            cronString: "* * 2 * 2"
                        }
                    ]
                }
            ]
        }
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
            runtime: "node"
          }
        },
        classes: [
          {
            path: "test"
          }
        ]
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
              cronString: "* * * * *"
            }
          ]
        }
      ]
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
});
