module.exports = {
    root: true,
    parser: "@typescript-eslint/parser",
    plugins: ["@typescript-eslint"],
    extends: [
        "eslint:recommended",
        "plugin:@typescript-eslint/eslint-recommended",
        "plugin:@typescript-eslint/recommended",
    ],
    ignorePatterns: [
        "tests",
        "sdk-external-modules",
        "src/telemetry",
        "jest.config.js",
        "solveEnvVariables.js",
        ".eslintrc.cjs",
    ],
    env: {
        node: true,
        es6: true,
    },
    rules: {
        "no-unused-vars": "off",
        "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
        "no-console": "error",
    },
};
