import { beforeEach, describe, expect, test, vi } from "vitest";

import { expandFunctionURLVariablesFromScripts } from "../../../src/utils/scripts";
import { log } from "../../../src/utils/logging";

describe("expand functions variables in genezio yaml ", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(log, "error"); // Spy on the log.error method
    });

    test("no variables to expand - single script command", async () => {
        const scripts = "npm run build";
        const functions = [
            { name: "functionHelloWorldApiUrl", url: "https://<uuid>.us-east-1.cloud.genez.io" },
        ];
        const result = await expandFunctionURLVariablesFromScripts(scripts, functions);
        expect(result).toEqual(["npm run build"]);
    });

    test("no variables to expand - multiple script commands", async () => {
        const scripts = ["npm run test", "npm run build"];
        const functions = [
            { name: "functionHelloWorldApiUrl", url: "https://<uuid>.us-east-1.cloud.genez.io" },
        ];
        const result = await expandFunctionURLVariablesFromScripts(scripts, functions);
        expect(result).toEqual(["npm run test", "npm run build"]);
    });

    test("expands a single variable", async () => {
        const scripts = "VITE_HELLO_API_URL=${{functionHelloWorldApiUrl}} npm run build";
        const functions = [
            { name: "functionHelloWorldApiUrl", url: "https://<uuid>.us-east-1.cloud.genez.io" },
        ];
        const result = await expandFunctionURLVariablesFromScripts(scripts, functions);
        expect(result).toEqual([
            "VITE_HELLO_API_URL=https://<uuid>.us-east-1.cloud.genez.io npm run build",
        ]);
    });

    test("expands multiple variables - same command", async () => {
        const scripts =
            "VITE_HELLO_API_URL=${{functionHelloWorldApiUrl}} VITE_GOODBYE_API_URL=${{functionGoodbyeWorldApiUrl}} npm run build";
        const functions = [
            { name: "functionHelloWorldApiUrl", url: "https://<uuid-1>.us-east-1.cloud.genez.io" },
            {
                name: "functionGoodbyeWorldApiUrl",
                url: "https://<uuid-2>.us-east-1.cloud.genez.io",
            },
        ];
        const result = await expandFunctionURLVariablesFromScripts(scripts, functions);
        expect(result).toEqual([
            "VITE_HELLO_API_URL=https://<uuid-1>.us-east-1.cloud.genez.io VITE_GOODBYE_API_URL=https://<uuid-2>.us-east-1.cloud.genez.io npm run build",
        ]);
    });

    test("expands multiple variables - distinct commands ", async () => {
        const scripts = [
            "VITE_HELLO_API_URL=${{functionHelloWorldApiUrl}} npm run build",
            "VITE_GOODBYE_API_URL=${{functionGoodbyeWorldApiUrl}} npm run build",
        ];
        const functions = [
            { name: "functionHelloWorldApiUrl", url: "https://<uuid-1>.us-east-1.cloud.genez.io" },
            {
                name: "functionGoodbyeWorldApiUrl",
                url: "https://<uuid-2>.us-east-1.cloud.genez.io",
            },
        ];
        const result = await expandFunctionURLVariablesFromScripts(scripts, functions);
        expect(result).toEqual([
            "VITE_HELLO_API_URL=https://<uuid-1>.us-east-1.cloud.genez.io npm run build",
            "VITE_GOODBYE_API_URL=https://<uuid-2>.us-east-1.cloud.genez.io npm run build",
        ]);
    });

    test("expands a single variable - mixed script commands", async () => {
        const scripts = [
            "npm run test",
            "VITE_HELLO_API_URL=${{functionHelloWorldApiUrl}} npm run build",
        ];
        const functions = [
            { name: "functionHelloWorldApiUrl", url: "https://<uuid>.us-east-1.cloud.genez.io" },
        ];
        const result = await expandFunctionURLVariablesFromScripts(scripts, functions);
        expect(result).toEqual([
            "npm run test",
            "VITE_HELLO_API_URL=https://<uuid>.us-east-1.cloud.genez.io npm run build",
        ]);
    });

    test("error for undefined scripts", async () => {
        const scripts = undefined;
        const functions = [
            { name: "functionHelloWorldApiUrl", url: "https://<uuid>.us-east-1.cloud.genez.io" },
        ];
        const result = await expandFunctionURLVariablesFromScripts(scripts, functions);
        expect(result).toEqual(undefined);
    });

    test("error for undefined functions", async () => {
        const scripts = "VITE_HELLO_API_URL=${{functionHelloWorldApiUrl}} npm run build";
        const functions = undefined;
        const result = await expandFunctionURLVariablesFromScripts(scripts, functions);
        expect(log.error).toHaveBeenCalledWith(
            "No functions found. Please make sure the functions are deployed.",
        );
        expect(result).toEqual(["VITE_HELLO_API_URL= npm run build"]);
    });

    test("error for empty scripts", async () => {
        const scripts = [];
        const functions = [
            { name: "functionHelloWorldApiUrl", url: "https://<uuid>.us-east-1.cloud.genez.io" },
        ];
        const result = await expandFunctionURLVariablesFromScripts(scripts, functions);
        expect(result).toEqual([]);
    });

    test("error for empty functions", async () => {
        const scripts = "VITE_HELLO_API_URL=${{functionHelloWorldApiUrl}} npm run build";
        const functions = [];
        const result = await expandFunctionURLVariablesFromScripts(scripts, functions);
        expect(log.error).toHaveBeenCalledWith(
            "API URL for ${{functionHelloWorldApiUrl}} not found. Please make sure the function is deployed.",
        );
        expect(result).toEqual(["VITE_HELLO_API_URL= npm run build"]);
    });

    test("error for wrong format variable", async () => {
        const scripts = "VITE_HELLO_API_URL=${{wrongFormat}} npm run build";
        const functions = [
            { name: "functionHelloWorldApiUrl", url: "https://<uuid>.us-east-1.cloud.genez.io" },
        ];
        const result = await expandFunctionURLVariablesFromScripts(scripts, functions);
        expect(log.error).toHaveBeenCalledWith(
            "Invalid variable format: ${{wrongFormat}}. Variable format should be ${{functionCamelCaseNameApiUrl}}",
        );
        expect(result).toEqual(["VITE_HELLO_API_URL= npm run build"]);
    });

    test("error for missing deployed function", async () => {
        const scripts = "VITE_HELLO_API_URL=${{functionHelloWorldApiUrl}} npm run build";
        const functions = [
            {
                name: "functionAnotherFunctionApiUrl",
                url: "https://<uuid>.us-east-1.cloud.genez.io",
            },
        ];
        const result = await expandFunctionURLVariablesFromScripts(scripts, functions);
        expect(log.error).toHaveBeenCalledWith(
            "API URL for ${{functionHelloWorldApiUrl}} not found. Please make sure the function is deployed.",
        );
        expect(result).toEqual(["VITE_HELLO_API_URL= npm run build"]);
    });
});
