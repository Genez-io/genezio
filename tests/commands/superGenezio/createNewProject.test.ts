import inquirer from "inquirer";
import { vol, fs as memfsFs, IFs } from "memfs";
import path from "path";
import { describe, test, expect, vi, beforeEach } from "vitest";
import { createNewProject } from "../../../src/commands/superGenezio/createNewProject";
import colors from "colors";
import { regions } from "../../../src/utils/configs";
import { setLinkPathForProject } from "../../../src/utils/linkDatabase";

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

describe("createNewProject", () => {
    beforeEach(() => {
        // Clean up the mocked file system before each test
        vol.reset();
    });

    test("shows overwrite warning propmt", async () => {
        // Create environment
        vol.mkdirSync(path.join(process.cwd(), "genezio-project"), { recursive: true });

        const promptSpy = vi.spyOn(inquirer, "prompt");
        // Mock imputing the project name
        promptSpy.mockResolvedValueOnce({ projectName: "genezio-project" });
        // Mock selecting cancel operation
        promptSpy.mockResolvedValueOnce({ overwriteDecision: "cancel" });

        // Run the super command
        await createNewProject();

        // Check if inquirer.prompt was called with the correct arguments
        expect(promptSpy).toHaveBeenNthCalledWith(2, [
            {
                type: "list",
                name: "overwriteDecision",
                message: colors.red("The project folder already exists. What do you want to do?"),
                choices: [
                    {
                        name: "Remove existing files and create a new project",
                        value: "deleteThenWrite",
                    },
                    {
                        name: "Cancel operation",
                        value: "cancel",
                    },
                    {
                        name: "Overwrite the existing files (.git and README.md will be kept)",
                        value: "overwrite",
                    },
                ],
            },
        ]);
    });

    test("creates a new fullstack monorepo project", async () => {
        // Create environment
        vol.mkdirSync(path.join(process.cwd()), { recursive: true });

        const promptSpy = vi.spyOn(inquirer, "prompt");

        // Mock imputing the project name
        promptSpy.mockResolvedValueOnce({ projectName: "genezio-project" });
        // Mock selecting region and project type
        promptSpy.mockResolvedValueOnce({
            projectRegion: regions[0].value,
            projectType: "fullstack",
        });

        promptSpy.mockResolvedValueOnce({ projectStructure: "monorepo" });
        promptSpy.mockResolvedValueOnce({ selectedLanguage: "TypeScript" });
        promptSpy.mockResolvedValueOnce({
            selectedTemplate: { repository: "backendURL", compatibilityMapping: "test" },
        });
        promptSpy.mockResolvedValueOnce({ selectedLanguage: "TypeScript" });
        promptSpy.mockResolvedValueOnce({
            selectedTemplate: { repository: "frontendURL", compatibilityMapping: "test" },
        });

        await createNewProject();

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

        // Project folder should be created
        expect(vol.existsSync(path.join(process.cwd(), "genezio-project"))).toBe(true);
        // The project folder should have a .git folder
        expect(vol.existsSync(path.join(process.cwd(), "genezio-project", ".git"))).toBe(true);
        // The project folder should have a genezio.yaml file
        expect(vol.existsSync(path.join(process.cwd(), "genezio-project", "genezio.yaml"))).toBe(
            true,
        );

        // Client has been cloned
        expect(vol.existsSync(path.join(process.cwd(), "genezio-project", "client"))).toBe(true);
        // Client should not have a genezio.yaml file
        expect(
            vol.existsSync(path.join(process.cwd(), "genezio-project", "client", "genezio.yaml")),
        ).toBe(false);

        // Server has been cloned
        expect(vol.existsSync(path.join(process.cwd(), "genezio-project", "server"))).toBe(true);
        // Server should not have a genezio.yaml file
        expect(
            vol.existsSync(path.join(process.cwd(), "genezio-project", "server", "genezio.yaml")),
        ).toBe(false);
    });

    test("creates a new fullstack multirepo project", async () => {
        // Create environment
        vol.mkdirSync(path.join(process.cwd()), { recursive: true });

        const promptSpy = vi.spyOn(inquirer, "prompt");

        // Mock imputing the project name
        promptSpy.mockResolvedValueOnce({ projectName: "genezio-project" });
        // Mock selecting region and project type
        promptSpy.mockResolvedValueOnce({
            projectRegion: regions[0].value,
            projectType: "fullstack",
        });

        promptSpy.mockResolvedValueOnce({ projectStructure: "multirepo" });
        promptSpy.mockResolvedValueOnce({ selectedLanguage: "TypeScript" });
        promptSpy.mockResolvedValueOnce({
            selectedTemplate: { repository: "backendURL", compatibilityMapping: "test" },
        });
        promptSpy.mockResolvedValueOnce({ selectedLanguage: "TypeScript" });
        promptSpy.mockResolvedValueOnce({
            selectedTemplate: { repository: "frontendURL", compatibilityMapping: "test" },
        });

        await createNewProject();

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

        expect(setLinkPathForProject).toHaveBeenCalled();

        // Project folder should be created
        expect(vol.existsSync(path.join(process.cwd(), "genezio-project"))).toBe(true);

        // Client has been cloned
        expect(vol.existsSync(path.join(process.cwd(), "genezio-project", "client"))).toBe(true);
        // Client should have a .git folder
        expect(vol.existsSync(path.join(process.cwd(), "genezio-project", "client", ".git"))).toBe(
            true,
        );
        // Client should have a genezio.yaml file
        expect(
            vol.existsSync(path.join(process.cwd(), "genezio-project", "client", "genezio.yaml")),
        ).toBe(true);

        // Server has been cloned
        expect(vol.existsSync(path.join(process.cwd(), "genezio-project", "server"))).toBe(true);
        // Server should have a .git folder
        expect(vol.existsSync(path.join(process.cwd(), "genezio-project", "server", ".git"))).toBe(
            true,
        );
        // Server should have a genezio.yaml file
        expect(
            vol.existsSync(path.join(process.cwd(), "genezio-project", "server", "genezio.yaml")),
        ).toBe(true);
    });

    test("creates a new backend project", async () => {
        // Create environment
        vol.mkdirSync(path.join(process.cwd()), { recursive: true });

        const promptSpy = vi.spyOn(inquirer, "prompt");

        // Mock imputing the project name
        promptSpy.mockResolvedValueOnce({ projectName: "genezio-project" });
        // Mock selecting region and project type
        promptSpy.mockResolvedValueOnce({
            projectRegion: regions[0].value,
            projectType: "backend",
        });

        promptSpy.mockResolvedValueOnce({ selectedLanguage: "TypeScript" });
        promptSpy.mockResolvedValueOnce({
            selectedTemplate: { repository: "backendURL", compatibilityMapping: "test" },
        });

        await createNewProject();

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

        // Project folder should be created
        expect(vol.existsSync(path.join(process.cwd(), "genezio-project"))).toBe(true);

        // Project folder should have a .git folder
        expect(vol.existsSync(path.join(process.cwd(), "genezio-project", ".git"))).toBe(true);
        // Project folder should have a genezio.yaml file
        expect(vol.existsSync(path.join(process.cwd(), "genezio-project", "genezio.yaml"))).toBe(
            true,
        );
    });
});
