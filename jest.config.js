export default {
  preset: "ts-jest/presets/default-esm",
  testEnvironment: "node",
  transform: {
    "\\.tsx?$": [
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
    "\\.jsx?$": "babel-jest",
  },
  moduleNameMapper: {
    "(.+)\\.js": "$1",
  },
  extensionsToTreatAsEsm: [".ts"],
  transformIgnorePatterns: ["node_modules/(?!(.*)/)"],
};
