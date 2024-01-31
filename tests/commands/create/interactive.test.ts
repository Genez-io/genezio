import inquirer from "inquirer";
import { vol, fs as memfsFs, IFs } from "memfs";
import path from "path";
import { describe, test, expect, vi, beforeEach } from "vitest";
import { askCreateOptions } from "../../../src/commands/create/interactive";
import colors from "colors";
import { regions } from "../../../src/utils/configs";

vi.mock("fs", () => {
    return { default: memfsFs };
});
vi.mock("fs/promises", () => {
    return { default: memfsFs.promises };
});
vi.mock("isomorphic-git", async (original) => {
    const git: {} = await original();
    return {
        default: {
            ...git,
            clone: vi.fn((args: { fs: IFs; dir: string }) => {
                args.fs.mkdirSync(path.join(args.dir, ".git"), { recursive: true });
                args.fs.writeFileSync(path.join(args.dir, "genezio.yaml"), "name: test");
            }),
        },
    };
});
vi.mock("../../../src/utils/linkDatabase");
vi.mock("axios", () => ({
    default: ({ url }: { url: string }) =>
        url.includes(regions[0].value)
            ? Promise.resolve({ status: 200 })
            : Promise.resolve({ status: 400 }),
}));

describe("askCreateOptions", () => {
    beforeEach(() => {
        // Clean up the mocked file system before each test
        vol.reset();
    });

    test("reads options for a fullstack project", async () => {
        // Create environment
        vol.mkdirSync(path.join(process.cwd()), { recursive: true });

        const promptSpy = vi.spyOn(inquirer, "prompt");

        // Mock imputing the project name, region and project type
        promptSpy.mockResolvedValueOnce({
            projectName: "genezio-project",
        });
        promptSpy.mockResolvedValueOnce({ projectRegion: regions[0].value });
        promptSpy.mockResolvedValueOnce({ projectType: "fullstack" });
        promptSpy.mockResolvedValueOnce({ template: "ts" });
        promptSpy.mockResolvedValueOnce({ template: "react-ts" });

        const options = await askCreateOptions();

        // Check if inquirer.prompt was called with the correct arguments
        expect(promptSpy).toHaveBeenCalledWith([
            expect.objectContaining({
                type: "input",
                name: "projectName",
                message: colors.magenta("Please enter a project name:"),
                default: "genezio-project",
            }),
        ]);
        expect(promptSpy).toHaveBeenCalledWith([
            expect.objectContaining({
                type: "list",
                name: "projectRegion",
                message: colors.magenta("Choose a region for your project:"),
                choices: regions,
            }),
        ]);
        expect(promptSpy).toHaveBeenCalledWith([
            expect.objectContaining({
                type: "list",
                name: "projectType",
                message: colors.magenta("What type of project would you like to create?"),
            }),
        ]);
        expect(promptSpy).toHaveBeenCalledWith([
            expect.objectContaining({
                type: "list",
                name: "template",
                message: colors.magenta("Choose a") + " Backend " + colors.magenta("template:"),
            }),
        ]);
        expect(promptSpy).toHaveBeenCalledWith([
            expect.objectContaining({
                type: "list",
                name: "template",
                message: colors.magenta("Choose a") + " Frontend " + colors.magenta("template:"),
            }),
        ]);

        expect(options).toEqual({
            name: "genezio-project",
            region: regions[0].value,
            type: "fullstack",
            backend: "ts",
            frontend: "react-ts",
            multirepo: false,
        });
    });

    test("reads options for a backend project", async () => {
        // Create environment
        vol.mkdirSync(path.join(process.cwd()), { recursive: true });

        const promptSpy = vi.spyOn(inquirer, "prompt");

        // Mock imputing the project name
        promptSpy.mockResolvedValueOnce({
            projectName: "genezio-project",
        });
        promptSpy.mockResolvedValueOnce({ projectRegion: regions[0].value });
        promptSpy.mockResolvedValueOnce({ projectType: "backend" });
        promptSpy.mockResolvedValueOnce({ template: "ts" });

        const options = await askCreateOptions();

        // Check if inquirer.prompt was called with the correct arguments
        expect(promptSpy).toHaveBeenCalledWith([
            expect.objectContaining({
                type: "input",
                name: "projectName",
                message: colors.magenta("Please enter a project name:"),
                default: "genezio-project",
            }),
        ]);
        expect(promptSpy).toHaveBeenCalledWith([
            expect.objectContaining({
                type: "list",
                name: "projectRegion",
                message: colors.magenta("Choose a region for your project:"),
                choices: regions,
            }),
        ]);
        expect(promptSpy).toHaveBeenCalledWith([
            expect.objectContaining({
                type: "list",
                name: "projectType",
                message: colors.magenta("What type of project would you like to create?"),
            }),
        ]);
        expect(promptSpy).toHaveBeenCalledWith([
            expect.objectContaining({
                type: "list",
                name: "template",
                message: colors.magenta("Choose a") + " Backend " + colors.magenta("template:"),
            }),
        ]);

        expect(options).toEqual({
            name: "genezio-project",
            region: regions[0].value,
            type: "backend",
            backend: "ts",
        });
    });

    test("reads partial options", async () => {
        // Create environment
        vol.mkdirSync(path.join(process.cwd()), { recursive: true });

        const promptSpy = vi.spyOn(inquirer, "prompt");

        // Mock imputing the project name, region and project type
        promptSpy.mockResolvedValueOnce({ projectRegion: regions[0].value });
        promptSpy.mockResolvedValueOnce({ template: "ts" });

        const options = await askCreateOptions({
            name: "genezio-project",
            type: "fullstack",
            frontend: "react-ts",
        });

        expect(promptSpy).toHaveBeenCalledWith([
            expect.objectContaining({
                type: "list",
                name: "projectRegion",
                message: colors.magenta("Choose a region for your project:"),
                choices: regions,
            }),
        ]);
        expect(promptSpy).toHaveBeenCalledWith([
            expect.objectContaining({
                type: "list",
                name: "template",
                message: colors.magenta("Choose a") + " Backend " + colors.magenta("template:"),
            }),
        ]);

        expect(options).toEqual({
            name: "genezio-project",
            region: regions[0].value,
            type: "fullstack",
            backend: "ts",
            frontend: "react-ts",
            multirepo: false,
        });
    });
});
