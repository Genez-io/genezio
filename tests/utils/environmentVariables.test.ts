import { describe, it, expect } from "vitest";
import { parseConfigurationVariable } from "../../src/utils/environmentVariables";

describe("parseConfigurationVariable", () => {
    it("should parse env variable correctly", async () => {
        const rawValue = "${{ env.MY_ENV_VAR }}";
        const result = await parseConfigurationVariable(rawValue);
        expect(result).toEqual({ key: "MY_ENV_VAR" });
    });

    it("should parse backend functions variable correctly", async () => {
        const rawValue = "${{ backend.functions.myFunction.url }}";
        const result = await parseConfigurationVariable(rawValue);
        expect(result).toEqual({ path: "backend.functions.myFunction", field: "url" });
    });

    it("should return raw value if no match is found", async () => {
        const rawValue = "plainValue";
        const result = await parseConfigurationVariable(rawValue);
        expect(result).toEqual({ value: "plainValue" });
    });

    it("should handle cases with spaces correctly for env variables", async () => {
        const rawValue = "${{ env.MY_ENV_VAR   }}";
        const result = await parseConfigurationVariable(rawValue);
        expect(result).toEqual({ key: "MY_ENV_VAR" });
    });

    it("should handle cases with spaces correctly for backend functions", async () => {
        const rawValue = "${{   backend.functions.myFunction.url   }}";
        const result = await parseConfigurationVariable(rawValue);
        expect(result).toEqual({ path: "backend.functions.myFunction", field: "url" });
    });

    it("should return raw value if format is incorrect", async () => {
        const rawValue = "${{ some.incorrect.format }";
        const result = await parseConfigurationVariable(rawValue);
        expect(result).toEqual({ value: rawValue });
    });
});
