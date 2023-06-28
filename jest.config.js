export default {
  preset: "ts-jest/presets/default-esm",
  testEnvironment: "node",
  transform: {
    "\\.[jt]sx?$": [
      "ts-jest",
      {
        diagnostics: {
          ignoreCodes: [1343]
        },
        useESM: true,
        astTransformers: {
          before: [
            {
              path: 'ts-jest-mock-import-meta',
            }
          ]
        }
      },
    ],
  },
  moduleNameMapper: {
    "(.+)\\.js": "$1",
  },
  extensionsToTreatAsEsm: [".ts"],
};
