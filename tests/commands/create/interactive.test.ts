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
vi.mock("../../../src/requests/getTemplateList", () => {
    return {
        getNewProjectTemplateList: vi.fn(() =>
            Promise.resolve([
                {
                    compatibilityMapping: "test",
                    repository: "backendURL",
                    category: "Backend",
                    language: "TypeScript",
                },
                {
                    compatibilityMapping: "test",
                    repository: "backendURL",
                    category: "Backend",
                    language: "TypeScript",
                },
                {
                    compatibilityMapping: "test",
                    repository: "backendURL",
                    category: "Backend",
                    language: "JavaScript",
                },
                {
                    compatibilityMapping: "test",
                    repository: "frontendURL",
                    category: "Frontend",
                    language: "TypeScript",
                },
                {
                    compatibilityMapping: "test",
                    repository: "frontendURL",
                    category: "Frontend",
                    language: "TypeScript",
                },
                {
                    compatibilityMapping: "test",
                    repository: "frontendURL",
                    category: "Frontend",
                    language: "JavaScript",
                },
            ]),
        ),
    };
});
vi.mock("../../../src/utils/linkDatabase");

describe("askCreateOptions", () => {
    beforeEach(() => {
        // Clean up the mocked file system before each test
        vol.reset();
    });

    test("reads options for a fullstack monorepo project", async () => {
        // Create environment
        vol.mkdirSync(path.join(process.cwd()), { recursive: true });

        const promptSpy = vi.spyOn(inquirer, "prompt");

        // Mock imputing the project name, region and project type
        promptSpy.mockResolvedValueOnce({
            projectName: "genezio-project",
            projectRegion: regions[0].value,
            projectType: "fullstack",
        });

        promptSpy.mockResolvedValueOnce({ projectStructure: "monorepo" });
        promptSpy.mockResolvedValueOnce({ selectedLanguage: "TypeScript" });
        promptSpy.mockResolvedValueOnce({
            selectedTemplate: {
                id: "backendId",
                repository: "backendURL",
                compatibilityMapping: "test",
            },
        });
        promptSpy.mockResolvedValueOnce({ selectedLanguage: "TypeScript" });
        promptSpy.mockResolvedValueOnce({
            selectedTemplate: {
                id: "frontendId",
                repository: "frontendURL",
                compatibilityMapping: "test",
            },
        });

        const options = await askCreateOptions();

        // Check if inquirer.prompt was called with the correct arguments
        expect(promptSpy).toHaveBeenCalledWith([
            expect.objectContaining({
                type: "input",
                name: "projectName",
                message: colors.magenta("Please enter a project name:"),
                default: "genezio-project",
            }),
            expect.objectContaining({
                type: "list",
                name: "projectRegion",
                message: colors.magenta("Choose a region for your project"),
                choices: regions,
            }),
            expect.objectContaining({
                type: "list",
                name: "projectType",
                message: colors.magenta("What type of project would you like to create?"),
            }),
        ]);
        expect(promptSpy).toHaveBeenCalledWith([
            expect.objectContaining({
                type: "list",
                name: "selectedLanguage",
                message:
                    colors.magenta("Select your desired ") +
                    colors.green("Backend") +
                    colors.magenta(" language:"),
            }),
        ]);
        expect(promptSpy).toHaveBeenCalledWith([
            expect.objectContaining({
                type: "list",
                name: "selectedTemplate",
                message:
                    colors.magenta("Select your desired ") +
                    colors.blue("TypeScript") +
                    colors.magenta(" template:"),
            }),
        ]);
        expect(promptSpy).toHaveBeenCalledWith([
            expect.objectContaining({
                type: "list",
                name: "selectedLanguage",
                message:
                    colors.magenta("Select your desired ") +
                    colors.green("Frontend") +
                    colors.magenta(" language:"),
            }),
        ]);
        expect(promptSpy).toHaveBeenCalledWith([
            expect.objectContaining({
                type: "list",
                name: "selectedTemplate",
                message:
                    colors.magenta("Select your desired ") +
                    colors.blue("TypeScript") +
                    colors.magenta(" template:"),
            }),
        ]);

        expect(options).toEqual({
            name: "genezio-project",
            region: regions[0].value,
            fullstack: ["backendId", "frontendId"],
            structure: "monorepo",
        });
    });

    test("reads options for a fullstack multirepo project", async () => {
        // Create environment
        vol.mkdirSync(path.join(process.cwd()), { recursive: true });

        const promptSpy = vi.spyOn(inquirer, "prompt");

        // Mock imputing the project name, region and project type
        promptSpy.mockResolvedValueOnce({
            projectName: "genezio-project",
            projectRegion: regions[0].value,
            projectType: "fullstack",
        });

        promptSpy.mockResolvedValueOnce({ projectStructure: "multirepo" });
        promptSpy.mockResolvedValueOnce({ selectedLanguage: "TypeScript" });
        promptSpy.mockResolvedValueOnce({
            selectedTemplate: {
                id: "backendId",
                repository: "backendURL",
                compatibilityMapping: "test",
            },
        });
        promptSpy.mockResolvedValueOnce({ selectedLanguage: "TypeScript" });
        promptSpy.mockResolvedValueOnce({
            selectedTemplate: {
                id: "frontendId",
                repository: "frontendURL",
                compatibilityMapping: "test",
            },
        });

        const options = await askCreateOptions();

        // Check if inquirer.prompt was called with the correct arguments
        expect(promptSpy).toHaveBeenCalledWith([
            expect.objectContaining({
                type: "input",
                name: "projectName",
                message: colors.magenta("Please enter a project name:"),
                default: "genezio-project",
            }),
            expect.objectContaining({
                type: "list",
                name: "projectRegion",
                message: colors.magenta("Choose a region for your project"),
                choices: regions,
            }),
            expect.objectContaining({
                type: "list",
                name: "projectType",
                message: colors.magenta("What type of project would you like to create?"),
            }),
        ]);
        expect(promptSpy).toHaveBeenCalledWith([
            expect.objectContaining({
                type: "list",
                name: "selectedLanguage",
                message:
                    colors.magenta("Select your desired ") +
                    colors.green("Backend") +
                    colors.magenta(" language:"),
            }),
        ]);
        expect(promptSpy).toHaveBeenCalledWith([
            expect.objectContaining({
                type: "list",
                name: "selectedTemplate",
                message:
                    colors.magenta("Select your desired ") +
                    colors.blue("TypeScript") +
                    colors.magenta(" template:"),
            }),
        ]);
        expect(promptSpy).toHaveBeenCalledWith([
            expect.objectContaining({
                type: "list",
                name: "selectedLanguage",
                message:
                    colors.magenta("Select your desired ") +
                    colors.green("Frontend") +
                    colors.magenta(" language:"),
            }),
        ]);
        expect(promptSpy).toHaveBeenCalledWith([
            expect.objectContaining({
                type: "list",
                name: "selectedTemplate",
                message:
                    colors.magenta("Select your desired ") +
                    colors.blue("TypeScript") +
                    colors.magenta(" template:"),
            }),
        ]);

        expect(options).toEqual({
            name: "genezio-project",
            region: regions[0].value,
            fullstack: ["backendId", "frontendId"],
            structure: "multirepo",
        });
    });

    test("reads options for a backend project", async () => {
        // Create environment
        vol.mkdirSync(path.join(process.cwd()), { recursive: true });

        const promptSpy = vi.spyOn(inquirer, "prompt");

        // Mock imputing the project name
        promptSpy.mockResolvedValueOnce({
            projectName: "genezio-project",
            projectRegion: regions[0].value,
            projectType: "backend",
        });

        promptSpy.mockResolvedValueOnce({ selectedLanguage: "TypeScript" });
        promptSpy.mockResolvedValueOnce({
            selectedTemplate: {
                id: "backendId",
                repository: "backendURL",
                compatibilityMapping: "test",
            },
        });

        const options = await askCreateOptions();

        // Check if inquirer.prompt was called with the correct arguments
        expect(promptSpy).toHaveBeenCalledWith([
            expect.objectContaining({
                type: "input",
                name: "projectName",
                message: colors.magenta("Please enter a project name:"),
                default: "genezio-project",
            }),
            expect.objectContaining({
                type: "list",
                name: "projectRegion",
                message: colors.magenta("Choose a region for your project"),
                choices: regions,
            }),
            expect.objectContaining({
                type: "list",
                name: "projectType",
                message: colors.magenta("What type of project would you like to create?"),
            }),
        ]);
        expect(promptSpy).toHaveBeenCalledWith([
            expect.objectContaining({
                type: "list",
                name: "selectedLanguage",
                message:
                    colors.magenta("Select your desired ") +
                    colors.green("Backend") +
                    colors.magenta(" language:"),
            }),
        ]);
        expect(promptSpy).toHaveBeenCalledWith([
            expect.objectContaining({
                type: "list",
                name: "selectedTemplate",
                message:
                    colors.magenta("Select your desired ") +
                    colors.blue("TypeScript") +
                    colors.magenta(" template:"),
            }),
        ]);

        expect(options).toEqual({
            name: "genezio-project",
            region: regions[0].value,
            backend: "backendId",
        });
    });
});
